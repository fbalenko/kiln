// Process-local store for deal_review + audit_log rows on the Vercel
// runtime, where the SQLite file is mounted read-only. Locally we keep
// the SQL flow unchanged; this module is a no-op there.
//
// What's stored:
//   • The full review payload (5 agent outputs + synthesis + similar
//     deals + customer signals + slack post + run metadata)
//   • The 5 audit rows the audit endpoint serves
//   • A reverse index dealId → most recent reviewId so the deal page's
//     "do I have a prior review?" check works without SQL
//
// Bounded LRU (default 32 reviews) so a long-lived process under
// repeated visitor + scenario traffic doesn't grow without bound.

import type { CustomerSignalsResult } from "@/lib/tools/exa-search";
import type { SimilarDealRecord } from "@/lib/tools/vector-search";
import type { SlackPostRecord } from "@/lib/tools/slack";

export interface InMemoryReviewRow {
  id: string;
  deal_id: string;
  ran_at: string;
  ran_by: string;
  pricing_output_json: string;
  asc606_output_json: string;
  redline_output_json: string;
  approval_output_json: string;
  comms_output_json: string;
  similar_deals_json: string;
  customer_signals_json: string;
  synthesis_summary: string;
  total_runtime_ms: number;
  total_tokens_used: number | null;
  is_visitor_submitted: number;
  slack_channel: string | null;
  slack_thread_ts: string | null;
  slack_posted_at: string | null;
  slack_permalink: string | null;
  slack_post_status: string | null;
  slack_post_reason: string | null;
  slack_post_error: string | null;
}

export interface InMemoryAuditRow {
  id: string;
  review_id: string;
  step_index: number;
  agent_name: string;
  step_label: string;
  input_json: string;
  output_json: string;
  reasoning_text: string;
  tools_called: string;
  duration_ms: number;
  tokens_used: number | null;
  ran_at: string;
}

export interface InMemoryReviewBundle {
  review: InMemoryReviewRow;
  audit: InMemoryAuditRow[];
}

export interface PersistInput {
  reviewId: string;
  dealId: string;
  isVisitorSubmitted: boolean;
  fromCache: boolean;
  outputs: {
    pricing: unknown;
    asc606: unknown;
    redline: unknown;
    approval: unknown;
    comms: unknown;
  };
  synthesis: string;
  similarDeals: SimilarDealRecord[];
  customerSignals: CustomerSignalsResult;
  slackPost: SlackPostRecord;
  totalRuntimeMs: number;
  totalTokens: number;
}

const MAX_ENTRIES = 32;

const globalForStore = globalThis as unknown as {
  __kilnInMemoryReviews?: Map<string, InMemoryReviewBundle>;
  __kilnInMemoryDealToReview?: Map<string, string>;
};

function reviews(): Map<string, InMemoryReviewBundle> {
  if (!globalForStore.__kilnInMemoryReviews) {
    globalForStore.__kilnInMemoryReviews = new Map();
  }
  return globalForStore.__kilnInMemoryReviews;
}

function dealIndex(): Map<string, string> {
  if (!globalForStore.__kilnInMemoryDealToReview) {
    globalForStore.__kilnInMemoryDealToReview = new Map();
  }
  return globalForStore.__kilnInMemoryDealToReview;
}

export function persistReviewInMemory(input: PersistInput): void {
  const now = new Date().toISOString();
  const review: InMemoryReviewRow = {
    id: input.reviewId,
    deal_id: input.dealId,
    ran_at: now,
    ran_by: input.fromCache ? "cache" : "orchestrator",
    pricing_output_json: JSON.stringify(input.outputs.pricing),
    asc606_output_json: JSON.stringify(input.outputs.asc606),
    redline_output_json: JSON.stringify(input.outputs.redline),
    approval_output_json: JSON.stringify(input.outputs.approval),
    comms_output_json: JSON.stringify(input.outputs.comms),
    similar_deals_json: JSON.stringify(input.similarDeals),
    customer_signals_json: JSON.stringify(input.customerSignals),
    synthesis_summary: input.synthesis,
    total_runtime_ms: input.totalRuntimeMs,
    total_tokens_used: input.totalTokens || null,
    is_visitor_submitted: input.isVisitorSubmitted ? 1 : 0,
    slack_channel: input.slackPost.channel,
    slack_thread_ts: input.slackPost.thread_ts,
    slack_posted_at: input.slackPost.posted_at,
    slack_permalink: input.slackPost.permalink,
    slack_post_status: input.slackPost.status,
    slack_post_reason: input.slackPost.reason,
    slack_post_error: input.slackPost.error,
  };

  const agentNames = [
    "pricing",
    "asc606",
    "redline",
    "approval",
    "comms",
  ] as const;
  const audit: InMemoryAuditRow[] = agentNames.map((name, i) => ({
    id: `aud_${input.reviewId}_${name}`,
    review_id: input.reviewId,
    step_index: i + 1,
    agent_name: name,
    step_label: `${name[0].toUpperCase() + name.slice(1)} Agent`,
    input_json: JSON.stringify({ deal_id: input.dealId }),
    output_json: JSON.stringify(input.outputs[name]),
    reasoning_text:
      (input.outputs[name] as { reasoning_summary?: string })
        ?.reasoning_summary ?? "",
    tools_called: JSON.stringify([
      "crm.get_deal",
      ...(name === "pricing" ? ["crm.get_pricing_guardrails"] : []),
      ...(name === "approval" ? ["crm.get_approval_matrix"] : []),
    ]),
    duration_ms: 0,
    tokens_used: null,
    ran_at: now,
  }));

  reviews().set(input.reviewId, { review, audit });
  dealIndex().set(input.dealId, input.reviewId);
  evictIfNeeded();
}

export function getReviewById(reviewId: string): InMemoryReviewBundle | null {
  return reviews().get(reviewId) ?? null;
}

export function getLatestReviewIdForDealInMemory(
  dealId: string,
): string | null {
  return dealIndex().get(dealId) ?? null;
}

export function clearReviewsForDealInMemory(dealId: string): void {
  const reviewId = dealIndex().get(dealId);
  if (reviewId) {
    reviews().delete(reviewId);
    dealIndex().delete(dealId);
  }
}

function evictIfNeeded(): void {
  const map = reviews();
  if (map.size <= MAX_ENTRIES) return;
  // Maps preserve insertion order — drop the oldest entries first.
  const toDrop = map.size - MAX_ENTRIES;
  let i = 0;
  for (const k of map.keys()) {
    if (i >= toDrop) break;
    const bundle = map.get(k);
    map.delete(k);
    if (bundle) {
      // Only clear the deal-index pointer if it still points at the
      // evicted review (a fresher run may have reassigned the deal).
      const current = dealIndex().get(bundle.review.deal_id);
      if (current === k) dealIndex().delete(bundle.review.deal_id);
    }
    i++;
  }
}
