import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Asc606OutputSchema, type Asc606Output } from "./schemas";
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

// ASC 606 Agent — accounting reasoning under ASC 606. Uses Opus 4.7 because
// rev rec is the highest-stakes output: a wrong call here gets the CFO/auditor
// to push back later. Pure reasoning, no tool calls.

const MODEL = "claude-opus-4-7";

const PROMPT_PATH = join(
  process.cwd(),
  "lib",
  "prompts",
  "asc606-agent.md",
);

export type Asc606SubstepId =
  | "identify_obligations"
  | "evaluate_distinctness"
  | "analyze_variable_consideration"
  | "assess_modification_risk"
  | "compute_recognition_schedule"
  | "flag_red_flags"
  | "finalizing";

export interface RunAsc606Options {
  onSubstep?: SubstepEmitter;
}

export async function runAsc606Agent(
  deal: DealWithCustomer,
  opts: RunAsc606Options = {},
): Promise<RunAgentResult<Asc606Output>> {
  const start = Date.now();
  const emit = opts.onSubstep ?? (() => {});

  emit({
    id: "identify_obligations",
    label: "Identifying performance obligations",
    status: "running",
  });

  const systemPrompt = readFileSync(PROMPT_PATH, "utf-8");
  const userMessage = buildUserMessage(deal);
  const watcher = new Asc606StreamWatcher(emit);

  const { assistantText, inputTokens, outputTokens, costUsd } =
    await executeAgentQuery({
      model: MODEL,
      systemPrompt,
      userMessage,
      feedDelta: (delta) => watcher.feed(delta),
    });

  watcher.flushOpen();

  const json = extractJsonObject(assistantText);
  const output = Asc606OutputSchema.parse(json);

  emit({
    id: "finalizing",
    label: "Finalizing recognition recommendation",
    status: "running",
  });
  await tinyPause(120);
  emit({
    id: "finalizing",
    label: `Finalized rev-rec analysis (${output.confidence} confidence, ${output.red_flags.length} red flags)`,
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

// Watch mid-stream for the major schema sections and emit substeps as they
// land. Field-name string anchors only — no incremental JSON parsing.
class Asc606StreamWatcher {
  private acc = "";
  private obligationsRunning = true; // we open it before the LLM stream begins
  private obligationCount = 0;
  private varConsiderationStarted = false;
  private modRiskStarted = false;
  private scheduleStarted = false;
  private scheduleCount = 0;
  private scheduleRunning = false;
  private redFlagsStarted = false;
  private redFlagCount = 0;
  private redFlagsRunning = false;

  constructor(private readonly emit: (e: SubstepEvent) => void) {
    // The "Identifying performance obligations" substep is already running
    // (emitted by the caller before this watcher was constructed). We close
    // it once we observe the first PO entry, then open "Evaluating
    // distinctness" with a count.
  }

  feed(chunk: string) {
    this.acc += chunk;

    // Performance obligations: close the "identify" substep on first PO,
    // then count via "is_distinct" appearances.
    if (this.obligationsRunning && this.acc.includes('"is_distinct"')) {
      const seen = countOccurrences(this.acc, '"is_distinct"');
      while (this.obligationCount < seen) {
        this.obligationCount++;
        if (this.obligationCount === 1) {
          // Pivot from "identifying" → "evaluating distinctness"
          this.emit({
            id: "identify_obligations",
            label: "Identified performance obligations",
            status: "complete",
          });
          this.emit({
            id: "evaluate_distinctness",
            label: `Evaluating distinctness (1)`,
            status: "running",
          });
        } else {
          this.emit({
            id: "evaluate_distinctness",
            label: `Evaluating distinctness (${this.obligationCount})`,
            status: "running",
          });
        }
      }
    }

    // Variable consideration begins.
    if (
      !this.varConsiderationStarted &&
      this.acc.includes('"variable_consideration_flags"')
    ) {
      this.varConsiderationStarted = true;
      // Close evaluate_distinctness if open.
      if (this.obligationsRunning) {
        this.obligationsRunning = false;
        this.emit({
          id: "evaluate_distinctness",
          label: `Evaluated ${this.obligationCount} performance obligations`,
          status: "complete",
        });
      }
      this.emit({
        id: "analyze_variable_consideration",
        label: "Analyzing variable consideration sources",
        status: "running",
      });
    }

    // Contract modification risk.
    if (
      !this.modRiskStarted &&
      this.acc.includes('"contract_modification_risk"')
    ) {
      this.modRiskStarted = true;
      this.emit({
        id: "analyze_variable_consideration",
        label: "Analyzed variable consideration",
        status: "complete",
      });
      this.emit({
        id: "assess_modification_risk",
        label: "Assessing contract modification risk",
        status: "running",
      });
    }

    // Recognition schedule begins.
    if (
      !this.scheduleStarted &&
      this.acc.includes('"recognized_revenue_schedule"')
    ) {
      this.scheduleStarted = true;
      this.scheduleRunning = true;
      this.emit({
        id: "assess_modification_risk",
        label: "Assessed contract modification risk",
        status: "complete",
      });
      this.emit({
        id: "compute_recognition_schedule",
        label: "Computing revenue recognition schedule",
        status: "running",
      });
    }

    // Count revenue-schedule entries by their `"period"` field.
    if (this.scheduleRunning) {
      const seen = countOccurrences(this.acc, '"period"');
      while (this.scheduleCount < seen) {
        this.scheduleCount++;
        this.emit({
          id: "compute_recognition_schedule",
          label: `Computing recognition schedule (period ${this.scheduleCount})`,
          status: "running",
        });
      }
    }

    // Red flags begin.
    if (!this.redFlagsStarted && this.acc.includes('"red_flags"')) {
      this.redFlagsStarted = true;
      this.redFlagsRunning = true;
      if (this.scheduleRunning) {
        this.scheduleRunning = false;
        this.emit({
          id: "compute_recognition_schedule",
          label: `Computed recognition schedule (${this.scheduleCount} periods)`,
          status: "complete",
        });
      }
      this.emit({
        id: "flag_red_flags",
        label: "Flagging red flags (0)",
        status: "running",
      });
    }

    // Count red flags by `"label"` field appearances inside the red_flags
    // array. Use `"severity"` instead of `"label"` since other sections also
    // use label.
    if (this.redFlagsRunning) {
      const after = this.acc.indexOf('"red_flags"');
      const window = after >= 0 ? this.acc.slice(after) : this.acc;
      const seen = countOccurrences(window, '"severity"');
      while (this.redFlagCount < seen) {
        this.redFlagCount++;
        this.emit({
          id: "flag_red_flags",
          label: `Flagging red flags (${this.redFlagCount})`,
          status: "running",
        });
      }
    }

    // reasoning_summary appears at the end → close red flags substep.
    if (this.redFlagsRunning && this.acc.includes('"reasoning_summary"')) {
      this.redFlagsRunning = false;
      this.emit({
        id: "flag_red_flags",
        label: `Flagged ${this.redFlagCount} red flags`,
        status: "complete",
      });
    }
  }

  flushOpen() {
    if (this.obligationsRunning) {
      this.obligationsRunning = false;
      this.emit({
        id: "evaluate_distinctness",
        label: `Evaluated ${this.obligationCount} performance obligations`,
        status: "complete",
      });
    }
    if (this.scheduleRunning) {
      this.scheduleRunning = false;
      this.emit({
        id: "compute_recognition_schedule",
        label: `Computed recognition schedule (${this.scheduleCount} periods)`,
        status: "complete",
      });
    }
    if (this.redFlagsRunning) {
      this.redFlagsRunning = false;
      this.emit({
        id: "flag_red_flags",
        label: `Flagged ${this.redFlagCount} red flags`,
        status: "complete",
      });
    }
  }
}

function buildUserMessage(deal: DealWithCustomer): string {
  return [
    "Apply ASC 606 to the following deal and return an `Asc606Output` JSON object as specified in your system prompt. Do not call any tools.",
    "",
    "## Deal under review",
    "```json",
    JSON.stringify(deal, null, 2),
    "```",
    "",
    "Return one JSON object now. No preamble. No code fences. JSON only.",
  ].join("\n");
}
