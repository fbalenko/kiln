// Per-deal last-activity timestamps for the pipeline's "Last activity"
// column. Pulls from deal_reviews — the most recent ran_at per deal
// (synthesis time). Deals without any review return null and the
// column renders a muted "—".

import { getDb } from "@/lib/db/client";

export { formatRelative } from "./format-relative";

export function getLastActivityByDeal(): Map<string, string> {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT deal_id, MAX(ran_at) AS last_activity
      FROM deal_reviews
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

// formatRelative is exported above from ./format-relative so client
// components can import it without dragging in better-sqlite3.
