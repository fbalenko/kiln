import { WebClient, ErrorCode } from "@slack/web-api";
import type { KnownBlock, MessageAttachment } from "@slack/web-api";
import type { DealWithCustomer } from "@/lib/db/queries";
import type {
  ApprovalOutput,
  Asc606Output,
  CommsOutput,
  PricingOutput,
  RedlineOutput,
} from "@/lib/agents/schemas";
import { formatACV, formatTerm, formatDealType } from "@/lib/format";

// Slack posting wrapper for the demo workspace.
// docs/06-integrations.md §Slack pins the contract:
//   • channel = #deal-desk (resolved via SLACK_DEAL_DESK_CHANNEL_ID)
//   • Block Kit shape: header → metadata → divider → summary → severity
//     fields → context block (with link back to /deals/<id>; explicitly
//     calls out that the approval workflow lives on the deal page so
//     viewers don't expect to act inside Slack)
//   • The single decorative emoji allowed across the entire UI is 🔥
//     (Kiln brand). Other emojis stay out.
//   • No interactive buttons. We considered approve/reject/needs_info
//     action buttons but Slack surfaces a "not configured to handle
//     interactive responses" warning unless the app has a real
//     interactivity URL — and standing one up just to log clicks is
//     not worth the operational complexity for a demo.
//
// We build the blocks deterministically from the typed Pricing/ASC 606 /
// Redline / Approval / Comms outputs rather than trusting whatever the
// Comms agent emitted in its `slack_post.blocks` field — the agent's prose
// is good but its Block Kit isn't reliably valid. Comms's `plaintext_fallback`
// is reused as the `text:` field for legacy clients and notifications.

const SLACK_TIMEOUT_MS = 5000;

export type SlackPostFailureReason =
  | "auth_error"
  | "rate_limit"
  | "channel_not_found"
  | "network_timeout"
  | "missing_config"
  | "invalid_blocks"
  | "unknown_error";

export interface SlackPostSuccess {
  status: "success";
  channel: string;
  thread_ts: string;
  posted_at: string;
  permalink: string | null;
}

export interface SlackPostFailure {
  status: "failed";
  reason: SlackPostFailureReason;
  error: string;
  retry_after_seconds: number | null;
}

export type SlackPostResult = SlackPostSuccess | SlackPostFailure;

export interface PostDealReviewArgs {
  deal: DealWithCustomer;
  pricing: PricingOutput;
  asc606: Asc606Output;
  redline: RedlineOutput;
  approval: ApprovalOutput;
  comms: CommsOutput;
  appUrl: string; // public app base URL (e.g. http://localhost:3000)
  // True when the deal originated from /submit. Surfaces a footer line
  // on the Slack message so the channel can distinguish visitor-driven
  // runs from seeded scenarios at a glance.
  isVisitorSubmitted?: boolean;
}

export async function postDealReview(
  args: PostDealReviewArgs,
): Promise<SlackPostResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_DEAL_DESK_CHANNEL_ID;
  if (!token || !channel) {
    return {
      status: "failed",
      reason: "missing_config",
      error:
        "SLACK_BOT_TOKEN and SLACK_DEAL_DESK_CHANNEL_ID must be set to post.",
      retry_after_seconds: null,
    };
  }

  const blocks = buildDealReviewBlocks(args);
  const text = args.comms.slack_post.plaintext_fallback?.trim()
    ? args.comms.slack_post.plaintext_fallback.trim()
    : `Deal review: ${args.deal.customer.name} — ${args.deal.name}`;

  const client = new WebClient(token, {
    timeout: SLACK_TIMEOUT_MS,
    retryConfig: { retries: 0 }, // we own retry semantics; never retry inline
  });

  try {
    const resp = await client.chat.postMessage({
      channel,
      blocks,
      text,
    });
    if (!resp.ok || !resp.ts) {
      return {
        status: "failed",
        reason: "unknown_error",
        error: `Slack returned ok=${resp.ok} without a ts`,
        retry_after_seconds: null,
      };
    }
    const permalink = await fetchPermalink(client, channel, resp.ts);
    return {
      status: "success",
      channel,
      thread_ts: resp.ts,
      posted_at: new Date().toISOString(),
      permalink,
    };
  } catch (err) {
    return classifyError(err);
  }
}

export async function postRetry(
  args: PostDealReviewArgs,
): Promise<SlackPostResult> {
  // Retry is identical to a fresh post — Slack has no idempotency primitive
  // for chat.postMessage, but a duplicate post is acceptable here (the
  // failed one didn't land, by definition).
  return postDealReview(args);
}

async function fetchPermalink(
  client: WebClient,
  channel: string,
  message_ts: string,
): Promise<string | null> {
  try {
    const resp = await client.chat.getPermalink({ channel, message_ts });
    return resp.permalink ?? null;
  } catch {
    // Permalink is a nice-to-have; never let it fail the post.
    return null;
  }
}

function classifyError(err: unknown): SlackPostFailure {
  const e = err as {
    code?: string;
    data?: { error?: string; response_metadata?: { retry_after?: number } };
    headers?: { "retry-after"?: string };
    message?: string;
  };

  const message = e?.message ?? String(err);

  // @slack/web-api error code mapping
  if (e?.code === ErrorCode.RateLimitedError) {
    const retryAfter =
      Number(e.headers?.["retry-after"]) ||
      e.data?.response_metadata?.retry_after ||
      null;
    return {
      status: "failed",
      reason: "rate_limit",
      error: `Slack rate-limited (retry after ${retryAfter ?? "?"}s)`,
      retry_after_seconds: retryAfter ?? null,
    };
  }

  if (e?.code === ErrorCode.RequestError || /timeout|aborted|ECONN/i.test(message)) {
    return {
      status: "failed",
      reason: "network_timeout",
      error: message,
      retry_after_seconds: null,
    };
  }

  // Auth errors come back as PlatformError with data.error in
  // {invalid_auth, not_authed, account_inactive, token_expired, token_revoked}.
  const authErrors = new Set([
    "invalid_auth",
    "not_authed",
    "account_inactive",
    "token_expired",
    "token_revoked",
  ]);
  if (e?.data?.error && authErrors.has(e.data.error)) {
    return {
      status: "failed",
      reason: "auth_error",
      error: `Slack auth error: ${e.data.error}`,
      retry_after_seconds: null,
    };
  }

  if (e?.data?.error === "channel_not_found") {
    return {
      status: "failed",
      reason: "channel_not_found",
      error:
        "Slack channel not found. Check SLACK_DEAL_DESK_CHANNEL_ID and that the bot is invited to the channel.",
      retry_after_seconds: null,
    };
  }

  if (e?.data?.error === "invalid_blocks") {
    return {
      status: "failed",
      reason: "invalid_blocks",
      error: "Slack rejected the Block Kit payload as invalid.",
      retry_after_seconds: null,
    };
  }

  return {
    status: "failed",
    reason: "unknown_error",
    error: message || "Unknown Slack error",
    retry_after_seconds: null,
  };
}

// ---------------------------------------------------------------------------
// Block Kit builder — deterministic from typed agent outputs.
// ---------------------------------------------------------------------------

export function buildDealReviewBlocks(
  args: PostDealReviewArgs,
): KnownBlock[] {
  const { deal, pricing, asc606, redline, approval, comms, appUrl } = args;

  const dealUrl = `${appUrl.replace(/\/$/, "")}/deals/${deal.id}`;

  const dealMetadataLine = [
    `*ACV:* ${formatACV(deal.acv)}`,
    `*Term:* ${formatTerm(deal.term_months)}`,
    `*Type:* ${formatDealType(deal.deal_type)}`,
    `*AE:* ${deal.ae_owner}`,
  ].join("  ·  ");

  const summaryText = pickSummaryText(comms);

  const pricingVerdict = pricingVerdictLabel(pricing);
  const asc606Flags = `${asc606.red_flags.length} flag${asc606.red_flags.length === 1 ? "" : "s"}`;
  const redlinePriority = capitalize(redline.overall_redline_priority);
  const approvalDepth = `${approval.approval_chain.length}-step (${approval.expected_cycle_time_business_days}bd)`;

  const contextElements = [
    {
      type: "mrkdwn" as const,
      text: `Open in Kiln → <${dealUrl}|view full review>  ·  approval workflow lives in the deal page`,
    },
  ];
  if (args.isVisitorSubmitted) {
    contextElements.push({
      type: "mrkdwn" as const,
      text: `:wave: Visitor-submitted deal · ${deal.customer.name}`,
    });
  }

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `🔥 Deal Review: ${deal.customer.name} — ${deal.name}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: dealMetadataLine },
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: summaryText },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Pricing*\n${pricingVerdict}` },
        { type: "mrkdwn", text: `*ASC 606*\n${asc606Flags}` },
        { type: "mrkdwn", text: `*Redline*\n${redlinePriority}` },
        { type: "mrkdwn", text: `*Approval*\n${approvalDepth}` },
      ],
    },
    {
      type: "context",
      elements: contextElements,
    },
  ];

  return blocks;
}

function pricingVerdictLabel(p: PricingOutput): string {
  const blockingFails = p.guardrail_evaluations.filter(
    (g) => !g.passed && g.severity === "block_absolute",
  ).length;
  const approvalFails = p.guardrail_evaluations.filter(
    (g) => !g.passed && g.severity === "block_without_approval",
  ).length;
  if (blockingFails > 0) {
    return `${blockingFails} hard fail${blockingFails === 1 ? "" : "s"}`;
  }
  if (approvalFails > 0) {
    return `${approvalFails} approval-gated`;
  }
  return `${p.effective_discount_pct.toFixed(1)}% off · ${p.margin_pct_estimate.toFixed(0)}% est margin`;
}

function pickSummaryText(comms: CommsOutput): string {
  const cap = (s: string, max: number) =>
    s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
  // Comms's reasoning_summary already reads like a 3-4 sentence executive
  // overview. Cap so Slack's section block doesn't get unwieldy.
  return cap(comms.reasoning_summary.trim(), 1200);
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Used by the SSE stream to surface a stable post-status shape regardless of
// whether the post was just made, came from cache, or failed.
export interface SlackPostRecord {
  status: "success" | "failed" | "skipped" | "cached";
  channel: string | null;
  thread_ts: string | null;
  posted_at: string | null;
  permalink: string | null;
  reason: SlackPostFailureReason | null;
  error: string | null;
}

export function successToRecord(s: SlackPostSuccess): SlackPostRecord {
  return {
    status: "success",
    channel: s.channel,
    thread_ts: s.thread_ts,
    posted_at: s.posted_at,
    permalink: s.permalink,
    reason: null,
    error: null,
  };
}

export function failureToRecord(f: SlackPostFailure): SlackPostRecord {
  return {
    status: "failed",
    channel: null,
    thread_ts: null,
    posted_at: null,
    permalink: null,
    reason: f.reason,
    error: f.error,
  };
}

// MessageAttachment is re-exported so MCP tool callers can produce typed
// payloads without importing @slack/web-api directly.
export type { KnownBlock, MessageAttachment };
