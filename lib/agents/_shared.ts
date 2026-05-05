import { query } from "@anthropic-ai/claude-agent-sdk";
import { jsonrepair } from "jsonrepair";
import { CRM_TOOL_NAMES, crmMcpServer } from "../mcp-servers/crm-server";

// Boilerplate for invoking the Claude Agent SDK on a leaf-node sub-agent —
// the kind that takes structured input via the user message and emits a
// single JSON object as output. Pricing, ASC 606, Redline, Approval, Comms,
// and the Orchestrator's synthesis call all share this shape.
//
// Sub-agents that need finer-grained substep instrumentation (e.g. the
// Pricing Agent's mid-stream guardrail counter) pass a `feedDelta` hook —
// every text delta is forwarded so the caller can pattern-match field
// landmarks and emit substeps in real time.

export type Model =
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001";

export interface ExecuteAgentOptions {
  model: Model;
  systemPrompt: string;
  userMessage: string;
  // Called with each text delta as the model streams its response. Use this
  // to drive a StreamWatcher that emits substep events on field landmarks.
  feedDelta?: (delta: string) => void;
  // Bound on the agent's tool-use loop. Leaf sub-agents that don't need to
  // call tools should pass 1 (single-turn). Use 2 to leave headroom for one
  // tool round-trip.
  maxTurns?: number;
}

export interface ExecuteAgentResult {
  assistantText: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

export async function executeAgentQuery(
  opts: ExecuteAgentOptions,
): Promise<ExecuteAgentResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is required to invoke the Claude Agent SDK.",
    );
  }

  const session = query({
    prompt: opts.userMessage,
    options: {
      model: opts.model,
      systemPrompt: opts.systemPrompt,
      tools: [],
      mcpServers: { crm: crmMcpServer },
      allowedTools: [...CRM_TOOL_NAMES],
      settingSources: [],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      thinking: { type: "disabled" },
      effort: "low",
      maxTurns: opts.maxTurns ?? 2,
      includePartialMessages: opts.feedDelta !== undefined,
    },
  });

  let assistantText = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let costUsd: number | null = null;
  let resultErrored = false;
  let resultErrorMessage: string | null = null;

  for await (const msg of session) {
    if (msg.type === "stream_event" && opts.feedDelta) {
      const ev = msg.event;
      if (ev.type === "content_block_delta" && "delta" in ev) {
        const delta = ev.delta as { type?: string; text?: string };
        if (delta.type === "text_delta" && typeof delta.text === "string") {
          opts.feedDelta(delta.text);
        }
      }
      continue;
    }
    if (msg.type === "result") {
      if (msg.subtype === "success") {
        assistantText = msg.result;
        // The SDK reports `input_tokens` net of cache reads/creates. For a
        // user-facing token count we want the gross input — sum all three.
        const usage = msg.usage as
          | {
              input_tokens?: number;
              output_tokens?: number;
              cache_read_input_tokens?: number;
              cache_creation_input_tokens?: number;
            }
          | undefined;
        inputTokens =
          usage === undefined
            ? null
            : (usage.input_tokens ?? 0) +
              (usage.cache_read_input_tokens ?? 0) +
              (usage.cache_creation_input_tokens ?? 0);
        outputTokens = usage?.output_tokens ?? null;
        costUsd = msg.total_cost_usd ?? null;
      } else {
        resultErrored = true;
        resultErrorMessage =
          (msg as { subtype?: string }).subtype ?? "unknown agent error";
      }
    }
  }

  if (resultErrored || !assistantText) {
    throw new Error(
      `Agent did not produce a final assistant message${
        resultErrorMessage ? `: ${resultErrorMessage}` : ""
      }`,
    );
  }

  return { assistantText, inputTokens, outputTokens, costUsd };
}

export function extractJsonObject(text: string): unknown {
  // Models occasionally wrap JSON in ```json ... ``` despite instructions, or
  // emit a stray newline before the opening brace. Find the first balanced
  // top-level object and parse it.
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error(
      `Agent response did not contain a JSON object. Raw: ${text.slice(0, 200)}`,
    );
  }
  const candidate = stripped.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    // LLMs occasionally emit JSON with unescaped quotes inside strings,
    // trailing commas, or smart quotes. Run through jsonrepair before
    // surfacing a hard failure.
    return JSON.parse(jsonrepair(candidate));
  }
}

// Cheap counter using indexOf in a loop. Used by every StreamWatcher.
export function countOccurrences(haystack: string, needle: string): number {
  let i = 0;
  let count = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    count++;
    i += needle.length;
  }
  return count;
}

// Wrap an agent invocation in a parse-and-validate-with-retry loop. The
// callable receives the user message (which the helper rewrites on retry to
// append a correction hint extracted from the previous failure) and returns
// the raw assistant text + token usage. The helper:
//   1. extractJsonObject + applies the optional `coerce` mutator
//   2. parses with the supplied Zod schema (or tries to JSON.parse if no
//      schema is given — used by sub-runners that own their own schemas)
//   3. on any failure, waits exponential-backoff and rewrites the user
//      message with the failure summary
//
// Used by Pricing, ASC 606, Redline, Approval, and the per-artifact Comms
// runners — every leaf sub-agent that emits a single JSON object.
export interface ExecuteWithRetryOptions<T> {
  model: Model;
  systemPrompt: string;
  baseUserMessage: string;
  feedDelta?: (delta: string) => void;
  maxTurns?: number;
  // Mutate the parsed JSON before validation. Used to repair common drift
  // (e.g. `estimation_difficulty: "moderate"` → "medium").
  coerce?: (raw: unknown) => void;
  // Validate the (possibly-coerced) JSON. Throws on failure.
  validate: (raw: unknown) => T;
  // How many extra attempts after the first. 2 = up to 3 total tries.
  retries?: number;
  // Backoff in ms between attempts. Default [1000, 3000].
  backoffMsByAttempt?: number[];
}

export interface ExecuteWithRetryResult<T> {
  output: T;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  attempts: number;
}

const DEFAULT_BACKOFF_MS = [1000, 3000];

export async function executeAgentWithSchemaRetry<T>(
  opts: ExecuteWithRetryOptions<T>,
): Promise<ExecuteWithRetryResult<T>> {
  const retries = opts.retries ?? 2;
  const backoff = opts.backoffMsByAttempt ?? DEFAULT_BACKOFF_MS;

  let lastError: unknown = null;
  let lastFailureHint: string | null = null;
  // Token usage accumulates across attempts so the orchestrator records the
  // true cost of a flaky sub-agent rather than only the successful try.
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  let sawTokens = false;
  let sawCost = false;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const userMessage =
      attempt === 0
        ? opts.baseUserMessage
        : opts.baseUserMessage +
          "\n\n---\n\nPREVIOUS ATTEMPT FAILED VALIDATION. " +
          (lastFailureHint ?? "Re-emit the full output with strict JSON.") +
          " Return ONE valid JSON object now matching the schema exactly. No preamble. No code fences. JSON only.";

    let raw: ExecuteAgentResult;
    try {
      raw = await executeAgentQuery({
        model: opts.model,
        systemPrompt: opts.systemPrompt,
        userMessage,
        feedDelta: attempt === 0 ? opts.feedDelta : undefined,
        maxTurns: opts.maxTurns,
      });
    } catch (err) {
      lastError = err;
      lastFailureHint =
        "The previous request errored before a JSON response was produced.";
      if (attempt < retries) {
        await tinyPause(backoff[Math.min(attempt, backoff.length - 1)]);
      }
      continue;
    }

    if (raw.inputTokens !== null) {
      totalInput += raw.inputTokens;
      sawTokens = true;
    }
    if (raw.outputTokens !== null) {
      totalOutput += raw.outputTokens;
      sawTokens = true;
    }
    if (raw.costUsd !== null) {
      totalCost += raw.costUsd;
      sawCost = true;
    }

    try {
      const json = extractJsonObject(raw.assistantText);
      opts.coerce?.(json);
      const output = opts.validate(json);
      return {
        output,
        inputTokens: sawTokens ? totalInput : null,
        outputTokens: sawTokens ? totalOutput : null,
        costUsd: sawCost ? totalCost : null,
        attempts: attempt + 1,
      };
    } catch (err) {
      lastError = err;
      lastFailureHint = summarizeValidationFailure(err);
      if (attempt < retries) {
        await tinyPause(backoff[Math.min(attempt, backoff.length - 1)]);
      }
    }
  }

  throw new Error(
    `Agent failed schema validation after ${retries + 1} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

// Best-effort one-paragraph rendering of a Zod (or generic) error. Fed back
// to the model on retry so it can self-correct.
function summarizeValidationFailure(err: unknown): string {
  if (!err) return "Unknown validation failure.";
  // Zod v4 error shape: error.issues = [{ path, message, code, ... }]
  const issues = (err as { issues?: unknown }).issues;
  if (Array.isArray(issues) && issues.length > 0) {
    const lines = issues.slice(0, 5).map((i) => {
      const issue = i as { path?: unknown; message?: string };
      const path =
        Array.isArray(issue.path) && issue.path.length > 0
          ? issue.path.join(".")
          : "<root>";
      return `- ${path}: ${issue.message ?? "invalid"}`;
    });
    return [
      "The previous JSON did not match the schema. Failures:",
      ...lines,
      "Re-emit a fully corrected JSON object — every listed path must conform.",
    ].join("\n");
  }
  if (err instanceof Error) {
    return `The previous JSON failed to parse: ${err.message}`;
  }
  return "The previous JSON failed validation.";
}

// Standard substep-event shape every agent module accepts via opts.onSubstep.
// The orchestrator wraps these with a `parent` label + absolute timestamp
// before forwarding to the SSE stream.
export interface SubstepEvent {
  id: string;
  label: string;
  status: "running" | "complete";
}

export type SubstepEmitter = (e: SubstepEvent) => void;

export function tinyPause(ms: number): Promise<void> {
  return new Promise<void>((res) => setTimeout(res, ms));
}

// Standard return shape for every sub-agent module. Output is the parsed Zod
// type. The orchestrator collates these into the combined cache.
export interface RunAgentResult<T> {
  output: T;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  durationMs: number;
}
