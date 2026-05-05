import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RedlineOutputSchema, type RedlineOutput } from "./schemas";
import type { DealWithCustomer } from "../db/queries";
import {
  countOccurrences,
  executeAgentQuery,
  extractJsonObject,
  tinyPause,
  type RunAgentResult,
  type SubstepEmitter,
  type SubstepEvent,
} from "./_shared";

// Redline Agent — clause-by-clause negotiation analysis. Sonnet 4.6 handles
// pattern-matching against known contract shapes well; Opus is overkill.

const MODEL = "claude-sonnet-4-6";

const PROMPT_PATH = join(
  process.cwd(),
  "lib",
  "prompts",
  "redline-agent.md",
);

export type RedlineSubstepId =
  | "load_context"
  | "scan_clauses"
  | "analyze_clauses"
  | "draft_counters"
  | "draft_fallbacks"
  | "cross_reference_signals"
  | "finalizing";

export interface RunRedlineOptions {
  onSubstep?: SubstepEmitter;
}

export async function runRedlineAgent(
  deal: DealWithCustomer,
  customerSignals: unknown,
  opts: RunRedlineOptions = {},
): Promise<RunAgentResult<RedlineOutput>> {
  const start = Date.now();
  const emit = opts.onSubstep ?? (() => {});

  emit({
    id: "load_context",
    label: "Loading deal context and customer signals",
    status: "running",
  });
  await tinyPause(150);
  emit({
    id: "load_context",
    label: "Loaded deal context and customer signals",
    status: "complete",
  });

  emit({
    id: "scan_clauses",
    label: "Scanning non-standard clauses",
    status: "running",
  });

  const systemPrompt = readFileSync(PROMPT_PATH, "utf-8");
  const userMessage = buildUserMessage(deal, customerSignals);
  const watcher = new RedlineStreamWatcher(emit);

  const { assistantText, inputTokens, outputTokens, costUsd } =
    await executeAgentQuery({
      model: MODEL,
      systemPrompt,
      userMessage,
      feedDelta: (delta) => watcher.feed(delta),
    });

  watcher.flushOpen();

  const json = extractJsonObject(assistantText);
  const output = RedlineOutputSchema.parse(json);

  emit({
    id: "finalizing",
    label: "Finalizing redline recommendations",
    status: "running",
  });
  await tinyPause(120);
  emit({
    id: "finalizing",
    label: `Finalized redline (${output.flagged_clauses.length} flagged · priority: ${output.overall_redline_priority})`,
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

class RedlineStreamWatcher {
  private acc = "";
  private clausesStarted = false;
  private clauseCount = 0;
  private clausesRunning = false;
  private countersStarted = false;
  private fallbacksStarted = false;
  private signalsStarted = false;
  private signalsClosed = false;

  constructor(private readonly emit: (e: SubstepEvent) => void) {}

  feed(chunk: string) {
    this.acc += chunk;

    // First flagged clause appearance closes scan_clauses, opens analyze.
    if (!this.clausesStarted && this.acc.includes('"flagged_clauses"')) {
      this.clausesStarted = true;
      this.clausesRunning = true;
      this.emit({
        id: "scan_clauses",
        label: "Scanned non-standard clauses",
        status: "complete",
      });
      this.emit({
        id: "analyze_clauses",
        label: "Analyzing flagged clauses (0)",
        status: "running",
      });
    }

    // Count flagged clauses via `"clause_type"` field.
    if (this.clausesRunning) {
      const seen = countOccurrences(this.acc, '"clause_type"');
      while (this.clauseCount < seen) {
        this.clauseCount++;
        this.emit({
          id: "analyze_clauses",
          label: `Analyzing flagged clauses (${this.clauseCount})`,
          status: "running",
        });
      }
    }

    // First "suggested_counter" closes analyze, opens draft_counters.
    if (!this.countersStarted && this.acc.includes('"suggested_counter"')) {
      this.countersStarted = true;
      if (this.clausesRunning) {
        this.clausesRunning = false;
        this.emit({
          id: "analyze_clauses",
          label: `Analyzed ${this.clauseCount} flagged clauses`,
          status: "complete",
        });
      }
      this.emit({
        id: "draft_counters",
        label: "Drafting counter-positions for high-risk clauses",
        status: "running",
      });
    }

    // First "fallback_position" closes draft_counters, opens draft_fallbacks.
    if (!this.fallbacksStarted && this.acc.includes('"fallback_position"')) {
      this.fallbacksStarted = true;
      this.emit({
        id: "draft_counters",
        label: "Drafted counter-positions",
        status: "complete",
      });
      this.emit({
        id: "draft_fallbacks",
        label: "Drafting fallback positions",
        status: "running",
      });
    }

    // standard_clauses_affirmed appearance signals fallbacks done, opens
    // cross-reference. The order in the schema isn't strictly fixed but
    // models reliably emit fields in declaration order.
    if (
      !this.signalsStarted &&
      !this.signalsClosed &&
      this.acc.includes('"standard_clauses_affirmed"')
    ) {
      this.signalsStarted = true;
      this.emit({
        id: "draft_fallbacks",
        label: "Drafted fallback positions",
        status: "complete",
      });
      this.emit({
        id: "cross_reference_signals",
        label: "Cross-referencing customer position-of-strength signals",
        status: "running",
      });
    }

    // reasoning_summary closes cross-reference. Mark signalsClosed so we
    // never re-open this section if more deltas land later.
    if (
      this.signalsStarted &&
      !this.signalsClosed &&
      this.acc.includes('"reasoning_summary"')
    ) {
      this.signalsStarted = false;
      this.signalsClosed = true;
      this.emit({
        id: "cross_reference_signals",
        label: "Cross-referenced position-of-strength signals",
        status: "complete",
      });
    }
  }

  flushOpen() {
    if (this.clausesRunning) {
      this.clausesRunning = false;
      this.emit({
        id: "analyze_clauses",
        label: `Analyzed ${this.clauseCount} flagged clauses`,
        status: "complete",
      });
    }
  }
}

function buildUserMessage(
  deal: DealWithCustomer,
  customerSignals: unknown,
): string {
  return [
    "Read the following deal + customer signals and return a `RedlineOutput` JSON object as specified in your system prompt. Do not call any tools.",
    "",
    "## Deal under review",
    "```json",
    JSON.stringify(deal, null, 2),
    "```",
    "",
    "## Customer signals (Exa, Phase 5 stub)",
    "```json",
    JSON.stringify(customerSignals, null, 2),
    "```",
    "",
    "Return one JSON object now. No preamble. No code fences. JSON only.",
  ].join("\n");
}
