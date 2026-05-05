import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PricingOutputSchema, type PricingOutput } from "./schemas";
import { getDealContext } from "../tools/crm";
import {
  countOccurrences,
  executeAgentQuery,
  extractJsonObject,
  tinyPause,
  type RunAgentResult,
  type SubstepEmitter,
  type SubstepEvent,
} from "./_shared";

// Pricing Agent — driven through @anthropic-ai/claude-agent-sdk's query().
//
// Phase 4 note: this module no longer owns a cache file. The orchestrator
// owns the combined `<deal>-review.json` cache for all 5 sub-agents +
// synthesis. This module is now a stateless function that runs the agent,
// streams substep events to the caller, and returns the parsed output.

const MODEL = "claude-sonnet-4-6";

const PROMPT_PATH = join(
  process.cwd(),
  "lib",
  "prompts",
  "pricing-agent.md",
);

export type PricingSubstepId =
  | "fetch_deal"
  | "load_guardrails"
  | "similar_deals"
  | "reasoning"
  | "guardrail_eval"
  | "alternatives"
  | "margin_sensitivity"
  | "finalizing";

export interface RunPricingOptions {
  onSubstep?: SubstepEmitter;
}

export async function runPricingAgent(
  dealId: string,
  opts: RunPricingOptions = {},
): Promise<RunAgentResult<PricingOutput>> {
  const start = Date.now();
  const emit = opts.onSubstep ?? (() => {});

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
  const watcher = new PricingStreamWatcher(emit, ctx.guardrails.length);

  const { assistantText, inputTokens, outputTokens, costUsd } =
    await executeAgentQuery({
      model: MODEL,
      systemPrompt,
      userMessage,
      feedDelta: (delta) => watcher.feed(delta),
    });

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
  await tinyPause(120);
  emit({
    id: "finalizing",
    label: `Finalized recommendation (${output.confidence} confidence)`,
    status: "complete",
  });

  return {
    output,
    inputTokens,
    outputTokens,
    costUsd,
    durationMs: Date.now() - start,
  };
}

// Watches streamed JSON text for schema-field landmarks and emits (N of M)
// substeps as the model writes guardrail / alternative entries. We never
// incrementally parse JSON — we count stable field-name anchors instead.
class PricingStreamWatcher {
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

    if (!this.guardrailsStarted && this.acc.includes('"guardrail_evaluations"')) {
      this.guardrailsStarted = true;
      this.guardrailRunning = true;
      this.emit({
        id: "guardrail_eval",
        label: `Evaluating guardrails (0 of ${this.expectedGuardrails})`,
        status: "running",
      });
    }

    if (this.guardrailRunning) {
      const seen = countOccurrences(this.acc, '"explanation"');
      while (this.guardrailCount < seen) {
        this.guardrailCount++;
        this.emit({
          id: "guardrail_eval",
          label: `Evaluating guardrails (${this.guardrailCount} of ${this.expectedGuardrails})`,
          status: "running",
        });
      }
    }

    if (!this.alternativesStarted && this.acc.includes('"alternative_structures"')) {
      this.alternativesStarted = true;
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

    if (this.alternativesRunning) {
      const seen = countOccurrences(this.acc, '"rationale"');
      while (this.alternativeCount < seen) {
        this.alternativeCount++;
        this.emit({
          id: "alternatives",
          label: `Generating alternative structures (${this.alternativeCount} of 3)`,
          status: "running",
        });
      }
    }

    if (this.alternativesRunning && this.acc.includes('"reasoning_summary"')) {
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
