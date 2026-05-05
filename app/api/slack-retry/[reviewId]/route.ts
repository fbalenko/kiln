import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getDealById } from "@/lib/db/queries";
import {
  failureToRecord,
  postRetry,
  successToRecord,
  type SlackPostRecord,
} from "@/lib/tools/slack";
import {
  ApprovalOutputSchema,
  Asc606OutputSchema,
  CommsOutputSchema,
  PricingOutputSchema,
  RedlineOutputSchema,
} from "@/lib/agents/schemas";

// POST /api/slack-retry/[reviewId] — retry a failed Slack post.
//
// Looks up the review row, rebuilds the post payload from the persisted
// agent outputs, and calls postDealReview() again. Updates the row with
// the new outcome. Returns the SlackPostRecord so the UI can swap state.
//
// Idempotency note: Slack has no idempotency primitive for chat.postMessage,
// but if the original failed (which is the precondition for retry) there's
// no duplicate to worry about. If a user clicks retry while a post is still
// in flight, the worst case is two messages — accept it.

export const runtime = "nodejs";

interface Params {
  params: Promise<{ reviewId: string }>;
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { reviewId } = await params;
  const db = getDb();

  const row = db
    .prepare(
      `SELECT
         deal_id,
         pricing_output_json, asc606_output_json, redline_output_json,
         approval_output_json, comms_output_json,
         slack_post_status
       FROM deal_reviews
       WHERE id = ?`,
    )
    .get(reviewId) as
    | {
        deal_id: string;
        pricing_output_json: string;
        asc606_output_json: string;
        redline_output_json: string;
        approval_output_json: string;
        comms_output_json: string;
        slack_post_status: string | null;
      }
    | undefined;

  if (!row) {
    return NextResponse.json({ error: "review_not_found" }, { status: 404 });
  }
  if (row.slack_post_status === "success" || row.slack_post_status === "cached") {
    return NextResponse.json(
      { error: "already_posted", current_status: row.slack_post_status },
      { status: 409 },
    );
  }

  const deal = getDealById(row.deal_id);
  if (!deal) {
    return NextResponse.json({ error: "deal_not_found" }, { status: 404 });
  }

  // Re-validate the persisted outputs through the Zod schemas so any drift
  // surfaces as a clear error instead of a malformed Block Kit payload.
  const pricing = PricingOutputSchema.parse(JSON.parse(row.pricing_output_json));
  const asc606 = Asc606OutputSchema.parse(JSON.parse(row.asc606_output_json));
  const redline = RedlineOutputSchema.parse(JSON.parse(row.redline_output_json));
  const approval = ApprovalOutputSchema.parse(JSON.parse(row.approval_output_json));
  const comms = CommsOutputSchema.parse(JSON.parse(row.comms_output_json));
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";

  const result = await postRetry({
    deal,
    pricing,
    asc606,
    redline,
    approval,
    comms,
    appUrl,
  });

  const record: SlackPostRecord =
    result.status === "success" ? successToRecord(result) : failureToRecord(result);

  db.prepare(
    `UPDATE deal_reviews
       SET slack_channel       = @channel,
           slack_thread_ts     = @thread_ts,
           slack_posted_at     = @posted_at,
           slack_permalink     = @permalink,
           slack_post_status   = @status,
           slack_post_reason   = @reason,
           slack_post_error    = @error
     WHERE id = @id`,
  ).run({
    id: reviewId,
    channel: record.channel,
    thread_ts: record.thread_ts,
    posted_at: record.posted_at,
    permalink: record.permalink,
    status: record.status,
    reason: record.reason,
    error: record.error,
  });

  return NextResponse.json(record, { status: record.status === "success" ? 200 : 502 });
}
