import { query } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PricingOutputSchema, type PricingOutput } from "./schemas";
import { getDealContext } from "../tools/crm";
import { CRM_TOOL_NAMES, crmMcpServer } from "../mcp-servers/crm-server";

// Pricing Agent — driven through @anthropic-ai/claude-agent-sdk's query().
//
// The SDK is the framework even though Phase 3's Pricing Agent is a leaf-node
// reasoning task: data is fed inline via the user message and the agent
// returns a single JSON object. Registering the `crm` MCP server keeps the
// architecture honest — Phase 4's orchestrator will exercise these same
// tools to gather context before fanning out to sub-agents.

const MODEL = "claude-sonnet-4-6";

const PROMPT_PATH = join(
  process.cwd(),
  "lib",
  "prompts",
  "pricing-agent.md",
);
const CACHE_DIR = join(process.cwd(), "db", "seed", "cached_outputs");

// Stable substep ids the client knows about. Order is the canonical sequence
// shown in the timeline (lib/agents/substep-plan.ts mirrors this for the UI).
export type PricingSubstepId =
  | "fetch_deal"
  | "load_guardrails"
  | "similar_deals"
  | "reasoning"
  | "guardrail_eval"
  | "alternatives"
  | "margin_sensitivity"
  | "finalizing";

export interface SubstepEvent {
  id: PricingSubstepId;
  label: string;
  status: "running" | "complete";
}

export interface RunPricingOptions {
  forceRefresh?: boolean;
  onSubstep?: (event: SubstepEvent) => void;
}

export interface RunPricingResult {
  output: PricingOutput;
  fromCache: boolean;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

export async function runPricingAgent(
  dealId: string,
  opts: RunPricingOptions = {},
): Promise<RunPricingResult> {
  const cachePath = join(CACHE_DIR, `${dealId}-pricing.json`);
  const start = Date.now();
  const emit = opts.onSubstep ?? (() => {});

  if (!opts.forceRefresh && existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, "utf-8")) as unknown;
    const output = PricingOutputSchema.parse(cached);
    return {
      output,
      fromCache: true,
      durationMs: Date.now() - start,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
    };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is required to run the Pricing Agent live (no cache hit).",
    );
  }

  // ---- Substep 1: deal fetch ----
  emit({ id: "fetch_deal", label: "Fetching deal record from CRM", status: "running" });
  const ctx = getDealContext(dealId);
  emit({ id: "fetch_deal", label: "Fetched deal record from CRM", status: "complete" });

  // ---- Substep 2: guardrails load ----
  const segmentLabel = humanizeSegment(ctx.deal.customer.segment);
  emit({
    id: "load_guardrails",
    label: `Loading active pricing guardrails for ${segmentLabel} segment`,
    status: "running",
  });
  // The guardrails are already inside ctx — emitting the boundary explicitly
  // so the user sees the work happen even though it cost <1ms.
  await tinyPause(200);
  emit({
    id: "load_guardrails",
    label: `Loaded ${ctx.guardrails.length} guardrails for ${segmentLabel} segment`,
    status: "complete",
  });

  // ---- Substep 3: similar deals (Phase 5 stub) ----
  emit({
    id: "similar_deals",
    label: "Identifying similar past deals via vector search",
    status: "running",
  });
  await tinyPause(300);
  emit({
    id: "similar_deals",
    label:
      ctx.similarDeals.length > 0
        ? `Found ${ctx.similarDeals.length} similar past deals`
        : "Vector search returns no precedent set (Phase 5 stub)",
    status: "complete",
  });

  // ---- Substep 4: LLM reasoning starts ----
  emit({
    id: "reasoning",
    label: "Reasoning about pricing economics",
    status: "running",
  });

  const systemPrompt = readFileSync(PROMPT_PATH, "utf-8");
  const userMessage = buildUserMessage(ctx);

  const session = query({
    prompt: userMessage,
    options: {
      model: MODEL,
      systemPrompt,
      tools: [],
      mcpServers: { crm: crmMcpServer },
      allowedTools: [...CRM_TOOL_NAMES],
      settingSources: [],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      thinking: { type: "disabled" },
      effort: "low",
      maxTurns: 2,
      // Stream raw deltas so we can pattern-match field appearances and
      // emit (N of 6) / (N of 3) substeps in real time as the model writes.
      includePartialMessages: true,
    },
  });

  const watcher = new StreamWatcher(emit, ctx.guardrails.length);
  let assistantText = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let costUsd: number | null = null;
  let resultErrored = false;
  let resultErrorMessage: string | null = null;

  for await (const msg of session) {
    if (msg.type === "stream_event") {
      const ev = msg.event;
      if (ev.type === "content_block_delta" && "delta" in ev) {
        const delta = ev.delta as { type?: string; text?: string };
        if (delta.type === "text_delta" && typeof delta.text === "string") {
          watcher.feed(delta.text);
        }
      }
      continue;
    }
    if (msg.type === "result") {
      if (msg.subtype === "success") {
        assistantText = msg.result;
        inputTokens = msg.usage?.input_tokens ?? null;
        outputTokens = msg.usage?.output_tokens ?? null;
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
      `Pricing Agent did not produce a final assistant message${
        resultErrorMessage ? `: ${resultErrorMessage}` : ""
      }`,
    );
  }

  // Close out any sub-stages the watcher started but didn't get to finalize
  // (e.g. if guardrail count ended up smaller than expected).
  watcher.flushOpen();
  emit({ id: "reasoning", label: "Reasoned about pricing economics", status: "complete" });

  // ---- Substep 7: margin sensitivity (post-parse derivation) ----
  emit({
    id: "margin_sensitivity",
    label: "Computing margin sensitivity under the 40% list-price baseline",
    status: "running",
  });
  const json = extractJsonObject(assistantText);
  const output = PricingOutputSchema.parse(json);
  await tinyPause(150);
  emit({
    id: "margin_sensitivity",
    label: `Computed margin sensitivity (${output.margin_pct_estimate.toFixed(1)}% est.)`,
    status: "complete",
  });

  // ---- Substep 8: finalize ----
  emit({
    id: "finalizing",
    label: "Finalizing recommendation",
    status: "running",
  });
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(output, null, 2));
  await tinyPause(120);
  emit({
    id: "finalizing",
    label: `Finalized recommendation (${output.confidence} confidence)`,
    status: "complete",
  });

  return {
    output,
    fromCache: false,
    durationMs: Date.now() - start,
    inputTokens,
    outputTokens,
    costUsd,
  };
}

// Watches streamed text for schema-field landmarks. The JSON itself is never
// safe to incrementally parse, but field names and array-element openers are
// stable string anchors — we count those, not parse JSON. Two pieces of state
// drive substep emissions: which array we're inside (guardrails vs.
// alternatives), and how many elements we've seen close.
class StreamWatcher {
  private acc = "";
  private guardrailsStarted = false;
  private alternativesStarted = false;
  private guardrailCount = 0;
  private alternativeCount = 0;
  private guardrailRunning = false;
  private alternativesRunning = false;
  private readonly expectedGuardrails: number;

  constructor(
    private readonly emit: (e: SubstepEvent) => void,
    expectedGuardrails: number,
  ) {
    this.expectedGuardrails = expectedGuardrails;
  }

  feed(chunk: string) {
    this.acc += chunk;

    // Guardrails substep boundary — fires the first time we see the field key.
    if (!this.guardrailsStarted && this.acc.includes('"guardrail_evaluations"')) {
      this.guardrailsStarted = true;
      this.guardrailRunning = true;
      this.emit({
        id: "guardrail_eval",
        label: `Evaluating guardrails (0 of ${this.expectedGuardrails})`,
        status: "running",
      });
    }

    // Count individual guardrail entries by looking for the closing `}` that
    // ends each entry inside the guardrail_evaluations array. Each entry has
    // a `"explanation":` field — counting those is more reliable than brace
    // matching across nested objects.
    if (this.guardrailRunning) {
      const seen = countOccurrences(this.acc, '"explanation"', this.guardrailCount);
      while (this.guardrailCount < seen) {
        this.guardrailCount++;
        this.emit({
          id: "guardrail_eval",
          label: `Evaluating guardrails (${this.guardrailCount} of ${this.expectedGuardrails})`,
          status: "running",
        });
      }
    }

    // Alternatives substep — start firing once the field key shows up.
    if (!this.alternativesStarted && this.acc.includes('"alternative_structures"')) {
      this.alternativesStarted = true;
      // Close out the guardrails substep cleanly.
      if (this.guardrailRunning) {
        this.guardrailRunning = false;
        this.emit({
          id: "guardrail_eval",
          label: `Evaluated ${this.guardrailCount} guardrails`,
          status: "complete",
        });
      }
      this.alternativesRunning = true;
      this.emit({
        id: "alternatives",
        label: "Generating alternative structures (0 of 3)",
        status: "running",
      });
    }

    // Count alternative_structures entries via their `"rationale":` field.
    if (this.alternativesRunning) {
      const seen = countOccurrences(this.acc, '"rationale"', this.alternativeCount);
      while (this.alternativeCount < seen) {
        this.alternativeCount++;
        this.emit({
          id: "alternatives",
          label: `Generating alternative structures (${this.alternativeCount} of 3)`,
          status: "running",
        });
      }
    }

    // The reasoning_summary field appears after both arrays close — use it as
    // the signal that the alternatives substep has wrapped.
    if (
      this.alternativesRunning &&
      this.acc.includes('"reasoning_summary"')
    ) {
      this.alternativesRunning = false;
      this.emit({
        id: "alternatives",
        label: `Generated ${this.alternativeCount} alternative structures`,
        status: "complete",
      });
    }
  }

  flushOpen() {
    if (this.guardrailRunning) {
      this.guardrailRunning = false;
      this.emit({
        id: "guardrail_eval",
        label: `Evaluated ${this.guardrailCount} guardrails`,
        status: "complete",
      });
    }
    if (this.alternativesRunning) {
      this.alternativesRunning = false;
      this.emit({
        id: "alternatives",
        label: `Generated ${this.alternativeCount} alternative structures`,
        status: "complete",
      });
    }
  }
}

function countOccurrences(haystack: string, needle: string, after = 0): number {
  // Cheap counter using indexOf in a loop. Returns the count starting from
  // index 0; the caller compares to its previous count to detect deltas.
  let i = 0;
  let count = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    count++;
    i += needle.length;
  }
  return count;
}

function humanizeSegment(segment: string): string {
  switch (segment) {
    case "enterprise":
      return "enterprise";
    case "mid_market":
      return "mid-market";
    case "plg_self_serve":
      return "PLG";
    default:
      return segment;
  }
}

function tinyPause(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

function buildUserMessage(ctx: ReturnType<typeof getDealContext>): string {
  return [
    "Review the following deal and return a `PricingOutput` JSON object as specified in your system prompt. Do not call any tools — every input you need is below.",
    "",
    "## Active deal under review",
    "```json",
    JSON.stringify(ctx.deal, null, 2),
    "```",
    "",
    "## Active pricing guardrails (scoped to deal segment + universal)",
    "```json",
    JSON.stringify(ctx.guardrails, null, 2),
    "```",
    "",
    "## Top similar past deals (precedent context)",
    "```json",
    JSON.stringify(ctx.similarDeals, null, 2),
    "```",
    "",
    "Return one JSON object now. No preamble. No code fences. JSON only.",
  ].join("\n");
}

function extractJsonObject(text: string): unknown {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error(
      `Pricing Agent response did not contain a JSON object. Raw: ${text.slice(0, 200)}`,
    );
  }
  return JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
}
