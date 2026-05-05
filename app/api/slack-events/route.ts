import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db/client";

// POST /api/slack-events
//
// Slack interactivity webhook. Receives `block_actions` payloads when a
// recruiter clicks ✅ Approve / ❌ Reject / 🔍 Needs more info on a deal-
// review post. We don't run an approval workflow — the buttons exist to make
// the post feel like a real product surface — but every click is logged to
// audit_log so the demo can show "Slack reaction → audit log → traceable".
//
// We do NOT auto-respond to the user, send a DM, or update the message.
// Per design constraint: the bot posts and that's it.
//
// Slack signature verification is intentionally OUT OF SCOPE for the demo
// (single-tenant workspace, no public traffic). If this endpoint is ever
// exposed beyond the demo, add a SLACK_SIGNING_SECRET check up front.

export const runtime = "nodejs";

interface BlockAction {
  action_id: string;
  block_id: string;
  value?: string;
}

interface InteractionPayload {
  type: string;
  user?: { id?: string; name?: string };
  channel?: { id?: string; name?: string };
  message?: { ts?: string };
  actions?: BlockAction[];
}

export async function POST(req: NextRequest) {
  // Slack sends application/x-www-form-urlencoded with `payload=<json>`.
  const formData = await req.formData().catch(() => null);
  const raw = formData?.get("payload");
  if (typeof raw !== "string") {
    return NextResponse.json({ error: "missing_payload" }, { status: 400 });
  }
  let payload: InteractionPayload;
  try {
    payload = JSON.parse(raw) as InteractionPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (payload.type !== "block_actions" || !payload.actions?.length) {
    // Acknowledge but log nothing for unsupported event types.
    return NextResponse.json({ ok: true });
  }

  const db = getDb();
  const action = payload.actions[0];
  const dealId = action.value ?? null;
  const threadTs = payload.message?.ts ?? null;

  // Locate the review row this post belongs to so we can link the audit
  // entry. May be null if the post predates the review schema or was
  // posted from a manual test — accept that and log without review_id.
  const reviewRow = threadTs
    ? (db
        .prepare(
          "SELECT id FROM deal_reviews WHERE slack_thread_ts = ? ORDER BY ran_at DESC LIMIT 1",
        )
        .get(threadTs) as { id?: string } | undefined)
    : undefined;

  db.prepare(
    `INSERT INTO audit_log (
       id, review_id, step_index, agent_name, step_label,
       input_json, output_json, reasoning_text, tools_called,
       duration_ms, tokens_used
     ) VALUES (
       @id, @review_id, @step_index, @agent_name, @step_label,
       @input_json, @output_json, @reasoning_text, @tools_called,
       @duration_ms, @tokens_used
     )`,
  ).run({
    id: `aud_${randomUUID()}`,
    review_id: reviewRow?.id ?? "manual_or_unknown",
    step_index: 99,
    agent_name: "slack",
    step_label: `Slack reaction: ${action.action_id}`,
    input_json: JSON.stringify({
      action_id: action.action_id,
      deal_id: dealId,
      user: payload.user,
      channel: payload.channel,
      thread_ts: threadTs,
    }),
    output_json: JSON.stringify({ ack: true }),
    reasoning_text: `User ${payload.user?.name ?? "?"} reacted with "${action.action_id}" on deal ${dealId ?? "?"}`,
    tools_called: JSON.stringify(["slack.block_action"]),
    duration_ms: 0,
    tokens_used: null,
  });

  // Slack expects a 200 within 3s. We've done all our work synchronously so
  // returning {ok: true} is sufficient — no message update, no ephemeral.
  return NextResponse.json({ ok: true });
}
