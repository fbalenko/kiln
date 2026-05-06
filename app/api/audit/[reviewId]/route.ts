import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

// GET /api/audit/[reviewId] — return the audit-log rows for a review,
// ordered chronologically. Powers the audit-log expandable footer in
// Mode 2 of the deal-detail page. Phase 8 will expand this surface with
// per-row JSON inspection; for Phase 7 polish we just need the rollup.
//
// 404s when the review id has no audit rows (covers cached scenario
// replays where the run wasn't persisted to the DB — the panel hides
// itself in that case).

export const runtime = "nodejs";

interface Params {
  params: Promise<{ reviewId: string }>;
}

interface AuditRow {
  id: string;
  step_index: number;
  agent_name: string;
  step_label: string;
  duration_ms: number;
  tokens_used: number | null;
  ran_at: string;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { reviewId } = await params;
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT id, step_index, agent_name, step_label, duration_ms,
              tokens_used, ran_at
         FROM audit_log
        WHERE review_id = ?
        ORDER BY step_index ASC, ran_at ASC`,
    )
    .all(reviewId) as AuditRow[];

  if (rows.length === 0) {
    return NextResponse.json({ entries: [] }, { status: 200 });
  }
  return NextResponse.json({ entries: rows }, { status: 200 });
}
