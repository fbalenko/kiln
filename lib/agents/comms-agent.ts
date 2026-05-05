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
} from "./_shared";

// Comms Agent — drafts the four downstream artifacts the deal team needs.
// Each artifact is its own focused query running in parallel: the wall time
// is bounded by the slowest single call (typically the customer email)
// rather than the sum of all four.
//
// Sonnet 4.6 because tone calibration matters more than cost; Haiku tends
// to slip into stock-marketing voice on tone-sensitive output.

const MODEL = "claude-sonnet-4-6";

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

  const ctx = { deal, customerSignals, pricing, asc606, redline, approval };

  // Fan out the 4 artifacts in parallel. Each call has its own narrow prompt
  // so it stays focused on one shape and finishes as fast as possible.
  emit({
    id: "draft_slack_post",
    label: "Drafting Slack post for #deal-desk",
    status: "running",
  });
  emit({
    id: "draft_ae_email",
    label: "Drafting AE email with structured action items",
    status: "running",
  });
  emit({
    id: "draft_customer_email",
    label: "Drafting customer reply with counter-positions",
    status: "running",
  });
  emit({
    id: "build_one_pager",
    label: "Building approval review one-pager",
    status: "running",
  });

  const [slackResult, aeResult, custResult, onePagerResult] = await Promise.all(
    [
      runSlackPost(ctx).then((r) => {
        emit({
          id: "draft_slack_post",
          label: "Drafted Slack post",
          status: "complete",
        });
        return r;
      }),
      runAeEmail(ctx).then((r) => {
        emit({
          id: "draft_ae_email",
          label: "Drafted AE email",
          status: "complete",
        });
        return r;
      }),
      runCustomerEmail(ctx).then((r) => {
        emit({
          id: "draft_customer_email",
          label: `Drafted customer reply (${r.output.tone} tone)`,
          status: "complete",
        });
        return r;
      }),
      runOnePager(ctx).then((r) => {
        emit({
          id: "build_one_pager",
          label: `Built approval review one-pager (${r.output.sections.length} sections)`,
          status: "complete",
        });
        return r;
      }),
    ],
  );

  emit({
    id: "finalizing",
    label: "Finalizing communication artifacts",
    status: "running",
  });
  await tinyPause(120);

  const output: CommsOutput = {
    slack_post: slackResult.output,
    ae_email_draft: aeResult.output,
    customer_email_draft: custResult.output,
    approval_review_one_pager: onePagerResult.output,
    reasoning_summary: buildReasoningSummary(
      ctx,
      custResult.output.tone,
      custResult.output.counter_positions_included.length,
    ),
  };

  // Defensive validate before handing back. If anything drifts the orchestrator
  // throws here rather than burying the issue downstream.
  CommsOutputSchema.parse(output);

  emit({
    id: "finalizing",
    label: `Finalized 4 artifacts (Slack · AE email · customer email · one-pager)`,
    status: "complete",
  });

  const inputTokens = sumNullable([
    slackResult.inputTokens,
    aeResult.inputTokens,
    custResult.inputTokens,
    onePagerResult.inputTokens,
  ]);
  const outputTokens = sumNullable([
    slackResult.outputTokens,
    aeResult.outputTokens,
    custResult.outputTokens,
    onePagerResult.outputTokens,
  ]);
  const costUsd = sumNullable([
    slackResult.costUsd,
    aeResult.costUsd,
    custResult.costUsd,
    onePagerResult.costUsd,
  ]);

  return {
    output,
    inputTokens,
    outputTokens,
    costUsd,
    durationMs: Date.now() - start,
  };
}

// ---------- Per-artifact runners ----------

interface CommsContext {
  deal: DealWithCustomer;
  customerSignals: unknown;
  pricing: PricingOutput;
  asc606: Asc606Output;
  redline: RedlineOutput;
  approval: ApprovalOutput;
}

const TONE_GUIDANCE = [
  "Tone calibration:",
  "- Enterprise expansion → collaborative-but-firm",
  "- PLG conversion → collaborative",
  "- Competitive displacement at risk → firm",
  "- Renewal at risk → warm",
  "- Partnership / non-standard → formal",
].join("\n");

function commonContextBlock(ctx: CommsContext): string {
  return [
    "## Deal",
    "```json",
    JSON.stringify(ctx.deal, null, 2),
    "```",
    "",
    "## Customer signals (Exa stub)",
    "```json",
    JSON.stringify(ctx.customerSignals, null, 2),
    "```",
    "",
    "## Pricing Agent output",
    "```json",
    JSON.stringify(ctx.pricing, null, 2),
    "```",
    "",
    "## ASC 606 Agent output",
    "```json",
    JSON.stringify(ctx.asc606, null, 2),
    "```",
    "",
    "## Redline Agent output",
    "```json",
    JSON.stringify(ctx.redline, null, 2),
    "```",
    "",
    "## Approval Agent output",
    "```json",
    JSON.stringify(ctx.approval, null, 2),
    "```",
  ].join("\n");
}

async function runSlackPost(ctx: CommsContext) {
  const systemPrompt = [
    "You are Clay's deal-desk Slack drafter. Given a full deal review, produce one Slack post for `#deal-desk` summarizing the review for the broader team.",
    "",
    "Format `blocks` as Slack Block Kit JSON. Standard structure:",
    "- A header block with deal name + customer",
    "- A section block with key numbers (ACV, effective discount, margin, approval chain summary)",
    "- A divider",
    "- A section listing the top 1-3 things the deal team should know (use `•` as bullets, no decorative emojis)",
    "- A context block with the AE owner and a `review filed by Kiln · agent-driven` footer",
    "",
    "Always set `channel_suggestion` to `#deal-desk`.",
    "Always provide a `plaintext_fallback` (3-5 plain-text lines for clients that don't render blocks).",
    "",
    "Return one JSON object exactly matching:",
    "```ts",
    "{ channel_suggestion: string, blocks: any, plaintext_fallback: string }",
    "```",
    "No preamble. No code fences. JSON only.",
  ].join("\n");
  const userMessage = [
    "Draft the Slack post for the following deal review.",
    "",
    commonContextBlock(ctx),
    "",
    "Return one JSON object now. No preamble. No code fences. JSON only.",
  ].join("\n");

  const r = await executeAgentQuery({ model: MODEL, systemPrompt, userMessage });
  const json = extractJsonObject(r.assistantText) as CommsOutput["slack_post"];
  return {
    output: CommsOutputSchema.shape.slack_post.parse(json),
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: r.costUsd,
  };
}

async function runAeEmail(ctx: CommsContext) {
  const systemPrompt = [
    "You are Clay's deal-desk AE-email drafter. Given a full deal review, produce one email *to the AE* (the deal owner) — direct, action-oriented, with the next 1-3 things they must do.",
    "",
    "- `to`: the AE owner's name from the deal record (use their first name in the body).",
    "- `subject`: action-oriented, e.g. \"[Anthropic] Pricing review complete — 3 items before submitting for approval\".",
    "- `body_markdown`: 4-8 sentences max. Lead with the verdict. List next steps as a numbered list. End with the approval chain so they know what they're walking into.",
    "- `suggested_send_time`: a phrase like `within 4 business hours` or `end of day` — not a wall clock time.",
    "",
    "Return one JSON object exactly matching:",
    "```ts",
    "{ to: string, subject: string, body_markdown: string, suggested_send_time: string }",
    "```",
    "No preamble. No code fences. JSON only.",
  ].join("\n");
  const userMessage = [
    "Draft the AE email for the following deal review.",
    "",
    commonContextBlock(ctx),
    "",
    "Return one JSON object now. No preamble. No code fences. JSON only.",
  ].join("\n");

  const r = await executeAgentQuery({ model: MODEL, systemPrompt, userMessage });
  const json = extractJsonObject(r.assistantText) as CommsOutput["ae_email_draft"];
  return {
    output: CommsOutputSchema.shape.ae_email_draft.parse(json),
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: r.costUsd,
  };
}

async function runCustomerEmail(ctx: CommsContext) {
  const systemPrompt = [
    "You are Clay's deal-desk customer-email drafter. Given a full deal review, produce a draft email the AE can lightly edit and send to the customer.",
    "",
    TONE_GUIDANCE,
    "",
    "- `to_role`: pick from `procurement`, `champion`, `economic_buyer`. Use `champion` when the customer-side relationship is strong.",
    "- `subject`: matches the tone — collaborative deals get collaborative subjects; firm pushbacks get direct subjects.",
    "- `body_markdown`: 5-10 sentences. Open by acknowledging where the customer is coming from. State Clay's position on each headline ask — accept, counter, or defer. Close with a clear next step. No marketing language. No emoji. No \"Hope this finds you well.\"",
    "- `tone`: pick from `collaborative`, `firm`, `warm`, `urgent`.",
    "- `counter_positions_included`: list the `clause_type`s from the Redline Agent's flagged clauses that this email actually counters. Empty array if you defer all redlines to a separate redlined-order-form pass.",
    "",
    "Return one JSON object exactly matching:",
    "```ts",
    "{ to_role: string, subject: string, body_markdown: string, tone: \"collaborative\"|\"firm\"|\"warm\"|\"urgent\", counter_positions_included: string[] }",
    "```",
    "No preamble. No code fences. JSON only.",
  ].join("\n");
  const userMessage = [
    "Draft the customer email for the following deal review.",
    "",
    commonContextBlock(ctx),
    "",
    "Return one JSON object now. No preamble. No code fences. JSON only.",
  ].join("\n");

  const r = await executeAgentQuery({ model: MODEL, systemPrompt, userMessage });
  const json = extractJsonObject(r.assistantText) as CommsOutput["customer_email_draft"];
  return {
    output: CommsOutputSchema.shape.customer_email_draft.parse(json),
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: r.costUsd,
  };
}

async function runOnePager(ctx: CommsContext) {
  const systemPrompt = [
    "You are Clay's deal-desk approval-one-pager drafter. Given a full deal review, produce a one-pager structured for an exec who has 90 seconds.",
    "",
    "- `title`: the deal name.",
    "- `sections`: an array of `{ heading, content_markdown }` covering at minimum:",
    "  - \"Headline\" — 1-2 sentences: what the deal is, what we're proposing",
    "  - \"Pricing summary\" — effective discount, margin, alternative structure if material",
    "  - \"Risk findings\" — collated from Redline + ASC 606 red flags",
    "  - \"Approval routing\" — the approval chain + estimated cycle time",
    "  - \"Recommendation\" — ship / ship-with-conditions / hold; one sentence why",
    "",
    "Return one JSON object exactly matching:",
    "```ts",
    "{ title: string, sections: Array<{ heading: string, content_markdown: string }> }",
    "```",
    "No preamble. No code fences. JSON only.",
  ].join("\n");
  const userMessage = [
    "Build the approval review one-pager for the following deal review.",
    "",
    commonContextBlock(ctx),
    "",
    "Return one JSON object now. No preamble. No code fences. JSON only.",
  ].join("\n");

  const r = await executeAgentQuery({ model: MODEL, systemPrompt, userMessage });
  const json = extractJsonObject(r.assistantText) as CommsOutput["approval_review_one_pager"];
  return {
    output: CommsOutputSchema.shape.approval_review_one_pager.parse(json),
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: r.costUsd,
  };
}

function buildReasoningSummary(
  ctx: CommsContext,
  tone: CommsOutput["customer_email_draft"]["tone"],
  countersCount: number,
): string {
  const verdict =
    ctx.approval.blockers_to_address_first.length > 0
      ? "ship-with-conditions (blockers must clear first)"
      : ctx.pricing.guardrail_evaluations.some(
            (g) =>
              !g.passed &&
              (g.severity === "block_absolute" ||
                g.severity === "block_without_approval"),
          )
        ? "ship-with-conditions (approval-gated)"
        : "ship";
  const cycleNote =
    typeof ctx.approval.expected_cycle_time_business_days === "number"
      ? `~${ctx.approval.expected_cycle_time_business_days} business days through ${ctx.approval.approval_chain.length}-step chain`
      : `${ctx.approval.approval_chain.length}-step approval chain`;
  return [
    `Calibrated customer email to ${tone} tone given the deal context.`,
    `AE email leads with verdict (${verdict}) and a numbered next-step list.`,
    `One-pager and Slack post both headline the recommendation and surface ${ctx.redline.flagged_clauses.length} flagged redline${ctx.redline.flagged_clauses.length === 1 ? "" : "s"} (${countersCount} countered in customer reply).`,
    `Approval routing summary: ${cycleNote}.`,
  ].join(" ");
}

function sumNullable(vals: (number | null)[]): number | null {
  let sum = 0;
  let any = false;
  for (const v of vals) {
    if (typeof v === "number") {
      sum += v;
      any = true;
    }
  }
  return any ? sum : null;
}
