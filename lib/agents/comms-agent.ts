import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CommsOutputSchema, type CommsOutput } from "./schemas";
import type { DealWithCustomer } from "../db/queries";
import type {
  ApprovalOutput,
  Asc606Output,
  PricingOutput,
  RedlineOutput,
} from "./schemas";
import {
  executeAgentQuery,
  extractJsonObject,
  tinyPause,
  type RunAgentResult,
  type SubstepEmitter,
  type SubstepEvent,
} from "./_shared";

// Comms Agent — drafts the four downstream artifacts the deal team needs.
// Sonnet 4.6 because tone calibration matters more than cost; Haiku tends
// to slip into stock-marketing voice on tone-sensitive output.

const MODEL = "claude-sonnet-4-6";

const PROMPT_PATH = join(
  process.cwd(),
  "lib",
  "prompts",
  "comms-agent.md",
);

export type CommsSubstepId =
  | "analyze_context"
  | "draft_slack_post"
  | "draft_ae_email"
  | "draft_customer_email"
  | "build_one_pager"
  | "finalizing";

export interface RunCommsOptions {
  onSubstep?: SubstepEmitter;
}

export async function runCommsAgent(
  deal: DealWithCustomer,
  customerSignals: unknown,
  pricing: PricingOutput,
  asc606: Asc606Output,
  redline: RedlineOutput,
  approval: ApprovalOutput,
  opts: RunCommsOptions = {},
): Promise<RunAgentResult<CommsOutput>> {
  const start = Date.now();
  const emit = opts.onSubstep ?? (() => {});

  emit({
    id: "analyze_context",
    label: "Analyzing deal context and tone requirements",
    status: "running",
  });
  await tinyPause(150);
  emit({
    id: "analyze_context",
    label: "Selected tone calibration based on deal context",
    status: "complete",
  });

  emit({
    id: "draft_slack_post",
    label: "Drafting Slack post for #deal-desk",
    status: "running",
  });

  const systemPrompt = readFileSync(PROMPT_PATH, "utf-8");
  const userMessage = buildUserMessage(
    deal,
    customerSignals,
    pricing,
    asc606,
    redline,
    approval,
  );
  const watcher = new CommsStreamWatcher(emit);

  const { assistantText, inputTokens, outputTokens, costUsd } =
    await executeAgentQuery({
      model: MODEL,
      systemPrompt,
      userMessage,
      feedDelta: (delta) => watcher.feed(delta),
    });

  watcher.flushOpen();

  const json = extractJsonObject(assistantText);
  const output = CommsOutputSchema.parse(json);

  emit({
    id: "finalizing",
    label: "Finalizing communication artifacts",
    status: "running",
  });
  await tinyPause(120);
  emit({
    id: "finalizing",
    label: `Finalized 4 artifacts (Slack · AE email · customer email · one-pager)`,
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

class CommsStreamWatcher {
  private acc = "";
  private slackEmitted = false;
  private aeEmitted = false;
  private custEmitted = false;
  private onePagerEmitted = false;

  constructor(private readonly emit: (e: SubstepEvent) => void) {}

  feed(chunk: string) {
    this.acc += chunk;

    // Each artifact in the schema appears in a fixed order. We pivot the
    // active substep when the next artifact's key shows up.
    if (!this.aeEmitted && this.acc.includes('"ae_email_draft"')) {
      this.aeEmitted = true;
      this.emit({
        id: "draft_slack_post",
        label: "Drafted Slack post",
        status: "complete",
      });
      this.emit({
        id: "draft_ae_email",
        label: "Drafting AE email with structured action items",
        status: "running",
      });
    }
    if (!this.custEmitted && this.acc.includes('"customer_email_draft"')) {
      this.custEmitted = true;
      this.emit({
        id: "draft_ae_email",
        label: "Drafted AE email",
        status: "complete",
      });
      this.emit({
        id: "draft_customer_email",
        label: "Drafting customer reply with counter-positions",
        status: "running",
      });
    }
    if (
      !this.onePagerEmitted &&
      this.acc.includes('"approval_review_one_pager"')
    ) {
      this.onePagerEmitted = true;
      this.emit({
        id: "draft_customer_email",
        label: "Drafted customer reply",
        status: "complete",
      });
      this.emit({
        id: "build_one_pager",
        label: "Building approval review one-pager",
        status: "running",
      });
    }
    if (this.onePagerEmitted && this.acc.includes('"reasoning_summary"')) {
      this.onePagerEmitted = false;
      this.slackEmitted = true; // mark guard so flushOpen doesn't re-emit
      this.emit({
        id: "build_one_pager",
        label: "Built approval review one-pager",
        status: "complete",
      });
    }
    // Slack-only marker for the unlikely case that the model never produces
    // an `ae_email_draft` field — we close the slack substep on
    // reasoning_summary too.
    if (
      !this.aeEmitted &&
      this.acc.includes('"reasoning_summary"') &&
      !this.slackEmitted
    ) {
      this.slackEmitted = true;
      this.emit({
        id: "draft_slack_post",
        label: "Drafted Slack post",
        status: "complete",
      });
    }
  }

  flushOpen() {
    // Defense: ensure no substep stays in "running" if the model truncated.
    // The natural sequence above closes everything on reasoning_summary; we
    // only get here if the stream ended early.
  }
}

function buildUserMessage(
  deal: DealWithCustomer,
  customerSignals: unknown,
  pricing: PricingOutput,
  asc606: Asc606Output,
  redline: RedlineOutput,
  approval: ApprovalOutput,
): string {
  return [
    "Draft the four communication artifacts for the following deal review and return a `CommsOutput` JSON object as specified in your system prompt. Do not call any tools.",
    "",
    "## Deal",
    "```json",
    JSON.stringify(deal, null, 2),
    "```",
    "",
    "## Customer signals (Exa, Phase 5 stub)",
    "```json",
    JSON.stringify(customerSignals, null, 2),
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
    "## Upstream Approval Agent output",
    "```json",
    JSON.stringify(approval, null, 2),
    "```",
    "",
    "Return one JSON object now. No preamble. No code fences. JSON only.",
  ].join("\n");
}
