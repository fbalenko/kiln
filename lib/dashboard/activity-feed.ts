// Server-side helper that pulls recent activity from deal_reviews. Each
// row produces 1–2 events: the synthesis itself, plus the Slack post
// when present. If deal_reviews is empty (cold deploy), the result is
// empty — the page renders the "Run your first review" empty state.

import { getDb } from "@/lib/db/client";

export type ActivityKind = "synthesis" | "slack_post";

export interface ActivityEntry {
  kind: ActivityKind;
  // ISO timestamp from the underlying row. Used for display + sort.
  ts: string;
  // Customer name + deal name for the human-readable line.
  customerName: string;
  dealName: string;
  // Deep link target for the row.
  dealId: string;
  // Slack permalink (only set on kind === "slack_post" with success).
  slackPermalink?: string;
}

interface RecentReviewRow {
  id: string;
  deal_id: string;
  ran_at: string;
  slack_posted_at: string | null;
  slack_permalink: string | null;
  slack_post_status: string | null;
  customer_name: string;
  deal_name: string;
}

export function getRecentActivity(limit = 8): ActivityEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        r.id,
        r.deal_id,
        r.ran_at,
        r.slack_posted_at,
        r.slack_permalink,
        r.slack_post_status,
        c.name AS customer_name,
        d.name AS deal_name
      FROM deal_reviews r
      JOIN deals d ON d.id = r.deal_id
      JOIN customers c ON c.id = d.customer_id
      ORDER BY r.ran_at DESC
      LIMIT ?
      `,
    )
    .all(limit) as RecentReviewRow[];

  const events: ActivityEntry[] = [];
  for (const row of rows) {
    events.push({
      kind: "synthesis",
      ts: row.ran_at,
      customerName: row.customer_name,
      dealName: row.deal_name,
      dealId: row.deal_id,
    });
    if (row.slack_posted_at && row.slack_post_status === "success") {
      events.push({
        kind: "slack_post",
        ts: row.slack_posted_at,
        customerName: row.customer_name,
        dealName: row.deal_name,
        dealId: row.deal_id,
        slackPermalink: row.slack_permalink ?? undefined,
      });
    }
  }

  // Re-sort by timestamp — synthesis and slack post can interleave across
  // reviews — and trim to limit.
  events.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return events.slice(0, limit);
}
