import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ApprovalOutputSchema, type ApprovalOutput } from "./schemas";
import type { DealWithCustomer, ApprovalMatrixRule } from "../db/queries";
import type {
  Asc606Output,
  PricingOutput,
  RedlineOutput,
} from "./schemas";
import {
  countOccurrences,
  executeAgentQuery,
  extractJsonObject,
  tinyPause,
  type RunAgentResult,
  type SubstepEmitter,
  type SubstepEvent,
} from "./_shared";

// Approval Agent — pure rule application. Haiku 4.5 is fast, cheap, and good
// at structured rule walks; Sonnet/Opus would be wasted compute here.

const MODEL = "claude-haiku-4-5-20251001";

const PROMPT_PATH = join(
  process.cwd(),
  "lib",
  "prompts",
  "approval-agent.md",
);

export type ApprovalSubstepId =
  | "load_matrix"
  | "evaluate_rules"
  | "identify_triggered"
  | "build_chain"
  | "compute_cycle_time"
  | "finalizing";

export interface RunApprovalOptions {
  onSubstep?: SubstepEmitter;
}

export async function runApprovalAgent(
  deal: DealWithCustomer,
  matrix: ApprovalMatrixRule[],
  pricing: PricingOutput,
  asc606: Asc606Output,
  redline: RedlineOutput,
  opts: RunApprovalOptions = {},
): Promise<RunAgentResult<ApprovalOutput>> {
  const start = Date.now();
  const emit = opts.onSubstep ?? (() => {});

  emit({
    id: "load_matrix",
    label: `Loading active approval matrix (${matrix.length} rules)`,
    status: "running",
  });
  await tinyPause(120);
  emit({
    id: "load_matrix",
    label: `Loaded ${matrix.length} active matrix rules`,
    status: "complete",
  });

  emit({
    id: "evaluate_rules",
    label: `Evaluating each matrix rule (0 of ${matrix.length})`,
    status: "running",
  });

  const systemPrompt = readFileSync(PROMPT_PATH, "utf-8");
  const userMessage = buildUserMessage(deal, matrix, pricing, asc606, redline);
  const watcher = new ApprovalStreamWatcher(emit, matrix.length);

  const { assistantText, inputTokens, outputTokens, costUsd } =
    await executeAgentQuery({
      model: MODEL,
      systemPrompt,
      userMessage,
      feedDelta: (delta) => watcher.feed(delta),
    });

  watcher.flushOpen();

  const json = extractJsonObject(assistantText);
  const output = ApprovalOutputSchema.parse(json);

  emit({
    id: "finalizing",
    label: "Finalizing routing decision",
    status: "running",
  });
  await tinyPause(120);
  emit({
    id: "finalizing",
    label: `Finalized routing (${output.approval_chain.length} steps · ${output.expected_cycle_time_business_days}d cycle time)`,
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

class ApprovalStreamWatcher {
  private acc = "";
  private requiredStarted = false;
  private requiredCount = 0;
  private requiredRunning = false;
  private chainStarted = false;
  private chainRunning = false;
  private cycleTimeSeen = false;
  private cycleTimeClosed = false;
  private readonly matrixSize: number;

  constructor(
    private readonly emit: (e: SubstepEvent) => void,
    matrixSize: number,
  ) {
    this.matrixSize = matrixSize;
  }

  feed(chunk: string) {
    this.acc += chunk;

    // First "rule_triggered" appearance closes evaluate_rules and opens
    // identify_triggered with a count.
    if (!this.requiredStarted && this.acc.includes('"rule_triggered"')) {
      this.requiredStarted = true;
      this.requiredRunning = true;
      this.emit({
        id: "evaluate_rules",
        label: `Evaluated ${this.matrixSize} matrix rules`,
        status: "complete",
      });
      this.emit({
        id: "identify_triggered",
        label: "Identifying triggered rules (0)",
        status: "running",
      });
    }

    if (this.requiredRunning) {
      const seen = countOccurrences(this.acc, '"rule_triggered"');
      while (this.requiredCount < seen) {
        this.requiredCount++;
        this.emit({
          id: "identify_triggered",
          label: `Identifying triggered rules (${this.requiredCount})`,
          status: "running",
        });
      }
    }

    // approval_chain begins → close identify_triggered, open build_chain.
    if (!this.chainStarted && this.acc.includes('"approval_chain"')) {
      this.chainStarted = true;
      this.chainRunning = true;
      if (this.requiredRunning) {
        this.requiredRunning = false;
        this.emit({
          id: "identify_triggered",
          label: `Identified ${this.requiredCount} triggered rules`,
          status: "complete",
        });
      }
      this.emit({
        id: "build_chain",
        label: "Building approval chain",
        status: "running",
      });
    }

    // expected_cycle_time appearance closes build_chain, opens compute.
    if (
      !this.cycleTimeSeen &&
      !this.cycleTimeClosed &&
      this.acc.includes('"expected_cycle_time_business_days"')
    ) {
      this.cycleTimeSeen = true;
      if (this.chainRunning) {
        this.chainRunning = false;
        this.emit({
          id: "build_chain",
          label: "Built approval chain",
          status: "complete",
        });
      }
      this.emit({
        id: "compute_cycle_time",
        label: "Computing expected cycle time",
        status: "running",
      });
    }

    // one_line_summary appearance closes compute_cycle_time.
    if (
      this.cycleTimeSeen &&
      !this.cycleTimeClosed &&
      this.acc.includes('"one_line_summary"')
    ) {
      this.cycleTimeSeen = false;
      this.cycleTimeClosed = true;
      this.emit({
        id: "compute_cycle_time",
        label: "Computed expected cycle time",
        status: "complete",
      });
    }
  }

  flushOpen() {
    if (this.requiredRunning) {
      this.requiredRunning = false;
      this.emit({
        id: "identify_triggered",
        label: `Identified ${this.requiredCount} triggered rules`,
        status: "complete",
      });
    }
    if (this.chainRunning) {
      this.chainRunning = false;
      this.emit({
        id: "build_chain",
        label: "Built approval chain",
        status: "complete",
      });
    }
  }
}

function buildUserMessage(
  deal: DealWithCustomer,
  matrix: ApprovalMatrixRule[],
  pricing: PricingOutput,
  asc606: Asc606Output,
  redline: RedlineOutput,
): string {
  return [
    "Apply the active approval matrix to the following deal + upstream agent outputs and return an `ApprovalOutput` JSON object as specified in your system prompt. Do not call any tools.",
    "",
    "## Deal",
    "```json",
    JSON.stringify(deal, null, 2),
    "```",
    "",
    "## Active approval matrix (sorted by rule_priority ascending)",
    "```json",
    JSON.stringify(matrix, null, 2),
    "```",
    "",
    "## Upstream Pricing Agent output",
    "```json",
    JSON.stringify(pricing, null, 2),
    "```",
    "",
    "## Upstream ASC 606 Agent output",
    "```json",
    JSON.stringify(asc606, null, 2),
    "```",
    "",
    "## Upstream Redline Agent output",
    "```json",
    JSON.stringify(redline, null, 2),
    "```",
    "",
    "Return one JSON object now. No preamble. No code fences. JSON only.",
  ].join("\n");
}
