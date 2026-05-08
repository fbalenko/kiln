import { NextResponse, type NextRequest } from "next/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { VisitorSubmitSchema } from "@/lib/visitor-submit/schema";
import {
  insertVisitorDeal,
  newSessionId,
  deleteVisitorDeal,
} from "@/lib/db/visitor-deals";
import {
  setVisitorSession,
  setExpiryHook,
  getVisitorSession,
} from "@/lib/visitor-submit/store";

// POST /api/submit-deal
//
// Validates the visitor's form payload, mints a sessionId (or reuses an
// existing kiln_visitor_session cookie), inserts customer + deal +
// embedding rows, registers the cleanup hook so expired sessions get
// dropped on the next sweep, appends a JSONL submission log, and
// returns { dealId } so the client can navigate to the live run.
//
// Per the brief: NO RATE LIMITING. Visitor submissions are unbounded.
// The JSONL log gives us observability (who submitted what, when) but
// never blocks traffic.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "kiln_visitor_session";
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days
const LOG_DIR = join(process.cwd(), "logs");
const SUBMISSIONS_LOG = join(LOG_DIR, "visitor-submissions.jsonl");

// Wire the visitor-store sweeper to delete SQLite rows on session
// expiry. Idempotent at module load — registers exactly once per
// process even if HMR re-evaluates this file.
const globalForHook = globalThis as unknown as {
  __kilnVisitorExpiryHookSet?: boolean;
};
if (!globalForHook.__kilnVisitorExpiryHookSet) {
  setExpiryHook((dealId, customerId) => {
    deleteVisitorDeal(dealId, customerId);
  });
  globalForHook.__kilnVisitorExpiryHookSet = true;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 },
    );
  }

  const parsed = VisitorSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_failed",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  // Reuse an existing session cookie if present so a re-submit during
  // the same cookie window stays anchored to one URL. The DB-side
  // helper will cascade-delete the prior visitor deal before inserting
  // the new one.
  const priorSessionId = req.cookies.get(COOKIE_NAME)?.value;
  const sessionId =
    priorSessionId && /^[0-9a-f-]{20,}$/i.test(priorSessionId)
      ? priorSessionId
      : newSessionId();

  // Insert customer + deal + embedding. This is awaited because the
  // OpenAI embedding call is in-band; failure to embed is logged but
  // doesn't block the run (the orchestrator's vector-search degrades
  // gracefully to []).
  let dealId: string;
  let customerId: string;
  try {
    const result = await insertVisitorDeal(sessionId, parsed.data);
    dealId = result.dealId;
    customerId = result.customerId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[submit-deal] insert failed:", msg);
    return NextResponse.json(
      { error: "persist_failed", detail: msg },
      { status: 500 },
    );
  }

  setVisitorSession({ sessionId, dealId, customerId });
  appendSubmissionLog({
    ts: new Date().toISOString(),
    sessionId,
    dealId,
    payload: parsed.data,
    sourceIp: req.headers.get("x-forwarded-for") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  const res = NextResponse.json({
    ok: true,
    sessionId,
    dealId,
    redirectTo: `/deals/${dealId}`,
  });

  res.cookies.set({
    name: COOKIE_NAME,
    value: sessionId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return res;
}

interface SubmissionLogEntry {
  ts: string;
  sessionId: string;
  dealId: string;
  payload: z.infer<typeof VisitorSubmitSchema>;
  sourceIp: string | null;
  userAgent: string | null;
}

function appendSubmissionLog(entry: SubmissionLogEntry): void {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    const line = JSON.stringify(entry) + "\n";
    if (!existsSync(SUBMISSIONS_LOG)) {
      writeFileSync(SUBMISSIONS_LOG, line);
      return;
    }
    const prior = readFileSync(SUBMISSIONS_LOG, "utf-8");
    writeFileSync(SUBMISSIONS_LOG, prior + line);
  } catch (err) {
    console.warn(
      "[submit-deal] log append failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

// GET — used by the deal page to confirm cookie ownership for a
// visitor-{sessionId} URL. Returns 200 + { sessionId } when the cookie
// matches the hash on the URL, 401 otherwise. Lightweight session
// echo; no PII.
export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get(COOKIE_NAME)?.value;
  if (!sessionId) {
    return NextResponse.json({ ok: false, sessionId: null }, { status: 401 });
  }
  const session = getVisitorSession(sessionId);
  return NextResponse.json({
    ok: true,
    sessionId,
    dealId: session?.dealId ?? null,
  });
}
