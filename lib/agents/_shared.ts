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
