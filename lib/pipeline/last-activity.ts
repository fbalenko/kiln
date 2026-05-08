// Per-deal last-activity timestamps for the pipeline's "Last activity"
// column. Pulls from deal_reviews — the most recent ran_at per deal
// (synthesis time). Deals without any review return null and the
// column renders a muted "—".
//
// Visitor-submitted reviews are excluded. The pipeline only renders
// non-visitor deals (listDeals filters them out at the SQL level), so
// any visitor entries in this map would be unused — but excluding them
// here keeps the contract symmetric and prevents a future caller from
// accidentally surfacing visitor timestamps.

import { getDb } from "@/lib/db/client";

// formatRelative lives in `./format-relative` — import it from there
// directly. Re-exporting it here caused Turbopack to treat
// last-activity.ts as reachable from any client component that wanted
// the formatter, which dragged better-sqlite3 into the client bundle.

export function getLastActivityByDeal(): Map<string, string> {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT deal_id, MAX(ran_at) AS last_activity
      FROM deal_reviews
      WHERE is_visitor_submitted = 0
      GROUP BY deal_id
      `,
    )
    .all() as { deal_id: string; last_activity: string | null }[];

  const out = new Map<string, string>();
  for (const r of rows) {
    if (r.last_activity) out.set(r.deal_id, r.last_activity);
  }
  return out;
}
