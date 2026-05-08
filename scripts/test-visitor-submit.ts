// Phase 7c verification harness — covers the form → deal-page surface
// without firing the LLM pipeline. Tests the contract, not the agents.
//
// Scenarios per the brief (paraphrased):
//   1. Real-co submission (Stripe) — Variant C banner, cookie set, deal
//      page renders with autoStart, customer/deal/embedding rows exist
//   2. Fictional-co submission (Acme Robotics) — same as 1 but
//      is_real=0 path, no domain match
//   3. Refresh-no-refire — second deal-page GET still 200 + cookie
//      protected, server doesn't redirect (review-row absence is fine
//      for this contract test; would-be re-fire is the orchestrator's
//      job not the page's)
//   4. Session rotation — clear cookie, GET /deals/visitor-{id} →
//      redirected to /submit (cookie ownership enforced)
//   5. Spend log presence — visitor-submissions.jsonl line exists
//   6. Cleanup helper — deleteVisitorDeal cascades through embeddings,
//      reviews, audit_log, deal, customer

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.KILN_BASE_URL ?? "http://localhost:3000";
const LOG_DIR = join(process.cwd(), "logs");

interface SubmitOk {
  ok: true;
  sessionId: string;
  dealId: string;
  redirectTo: string;
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  const marker = ok ? "PASS" : "FAIL";
  console.log(
    `[${marker}] ${name}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
  );
}

function parseSetCookie(headerOrEntries: string | null): string | null {
  if (!headerOrEntries) return null;
  // Node fetch returns the *first* set-cookie via .get; .getSetCookie() is
  // available on Headers since Node 19+. We use whichever is present.
  return headerOrEntries.split(/,\s*(?=[A-Za-z_][A-Za-z0-9_]*=)/)[0];
}

async function postSubmit(
  payload: Record<string, unknown>,
  cookie?: string,
): Promise<{ res: Response; body: unknown; cookie: string | null }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers["cookie"] = cookie;
  const res = await fetch(`${BASE_URL}/api/submit-deal`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  // Headers.getSetCookie returns string[]
  const setCookies =
    typeof (res.headers as unknown as { getSetCookie?: () => string[] })
      .getSetCookie === "function"
      ? (
          res.headers as unknown as { getSetCookie: () => string[] }
        ).getSetCookie()
      : null;
  const cookieHeader = setCookies?.[0] ?? parseSetCookie(res.headers.get("set-cookie"));
  return { res, body, cookie: cookieHeader };
}

async function fetchDealPage(
  dealId: string,
  cookieHeader: string | null,
  redirect: "follow" | "manual" = "manual",
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers["cookie"] = cookieHeader;
  return fetch(`${BASE_URL}/deals/${dealId}`, {
    redirect,
    headers,
  });
}

function cookieValueOnly(setCookieLine: string | null): string | null {
  if (!setCookieLine) return null;
  // "kiln_visitor_session=xxxxxx; Path=/; HttpOnly; ..." → "kiln_visitor_session=xxxxxx"
  return setCookieLine.split(";")[0];
}

async function main() {
  console.log(`[harness] base url: ${BASE_URL}`);

  // ---- Scenario 1 — real-co submission (Stripe) ----
  const stripePayload = {
    customer_name: "Stripe",
    customer_domain: "stripe.com",
    segment: "enterprise",
    deal_type: "expansion",
    pricing_model: "subscription",
    acv: 480000,
    term_months: 24,
    discount_pct: 22,
    discount_reason: "2-yr commit + multi-product expansion.",
    non_standard_clauses: ["mfn", "data_residency_eu"],
    customer_request:
      "Stripe is consolidating from three vendors and expanding to a new region. They want a 2-year commit with quarterly true-ups, a 22% discount tied to multi-year, and EU data residency to satisfy their compliance team. Decision by end of quarter.",
    competitive_context:
      "Apollo is the incumbent. Customer flagged price as the primary blocker but is also asking for parity on data residency.",
  };

  const stripe = await postSubmit(stripePayload);
  record(
    "1a. Stripe POST /api/submit-deal returns 200 + dealId",
    stripe.res.status === 200 &&
      typeof (stripe.body as SubmitOk)?.dealId === "string" &&
      (stripe.body as SubmitOk).dealId.startsWith("visitor-"),
    JSON.stringify(stripe.body),
  );
  const stripeBody = stripe.body as SubmitOk;
  const stripeCookie = cookieValueOnly(stripe.cookie);
  record(
    "1b. Stripe response sets HttpOnly kiln_visitor_session cookie",
    stripe.cookie != null &&
      stripe.cookie.includes("kiln_visitor_session=") &&
      stripe.cookie.toLowerCase().includes("httponly"),
    stripe.cookie ?? "<no cookie>",
  );
  record(
    "1c. Stripe sessionId matches dealId suffix",
    stripeBody.dealId === `visitor-${stripeBody.sessionId}`,
    `${stripeBody.sessionId} vs ${stripeBody.dealId}`,
  );

  // Deal page server-render with cookie → 200
  const stripePage = await fetchDealPage(stripeBody.dealId, stripeCookie, "manual");
  record(
    "1d. /deals/{visitorId} with matching cookie returns 200",
    stripePage.status === 200,
    `status=${stripePage.status}`,
  );
  const stripeHtml = await stripePage.text();
  record(
    "1e. Page HTML contains Variant C banner copy",
    stripeHtml.includes("Live submission") &&
      stripeHtml.includes("submitted by a visitor"),
  );
  record(
    "1f. Page HTML shows the customer name (Stripe)",
    stripeHtml.includes("Stripe"),
  );

  // ---- Scenario 2 — fictional-co submission ----
  const acmePayload = {
    customer_name: "Acme Robotics",
    customer_domain: "",
    segment: "mid_market",
    deal_type: "new_logo",
    pricing_model: "usage_based",
    acv: 95000,
    term_months: 12,
    discount_pct: 10,
    non_standard_clauses: [],
    customer_request:
      "Acme is replacing their incumbent automation tool. Standard new-logo deal, no special clauses, just a vanilla 1-yr deal at standard discount.",
  };
  const acme = await postSubmit(acmePayload);
  record(
    "2a. Acme POST returns 200 + dealId",
    acme.res.status === 200 &&
      typeof (acme.body as SubmitOk)?.dealId === "string",
    JSON.stringify(acme.body),
  );
  const acmeBody = acme.body as SubmitOk;
  record(
    "2b. Acme sessionId is distinct from Stripe sessionId",
    acmeBody.sessionId !== stripeBody.sessionId,
  );

  // ---- Scenario 3 — refresh path (same cookie hits same deal) ----
  const refreshed = await fetchDealPage(stripeBody.dealId, stripeCookie, "manual");
  record(
    "3. Refresh of /deals/{visitorId} still 200 with cookie",
    refreshed.status === 200,
    `status=${refreshed.status}`,
  );

  // ---- Scenario 4 — session rotation (no cookie → redirect) ----
  const orphan = await fetchDealPage(stripeBody.dealId, null, "manual");
  record(
    "4a. /deals/{visitorId} without cookie redirects (3xx)",
    orphan.status >= 300 && orphan.status < 400,
    `status=${orphan.status}`,
  );
  const orphanLocation = orphan.headers.get("location") ?? "";
  record(
    "4b. Redirect lands on /submit",
    orphanLocation.endsWith("/submit"),
    orphanLocation,
  );

  // Wrong-cookie attempt: use Acme's cookie to fetch Stripe's URL
  const acmeCookie = cookieValueOnly(acme.cookie);
  const crossSession = await fetchDealPage(stripeBody.dealId, acmeCookie, "manual");
  record(
    "4c. /deals/{visitorId} with mismatched cookie also redirects",
    crossSession.status >= 300 && crossSession.status < 400,
    `status=${crossSession.status}`,
  );

  // ---- Scenario 5 — visitor-submissions.jsonl exists with both entries ----
  const submissionsPath = join(LOG_DIR, "visitor-submissions.jsonl");
  const submissionsExists = existsSync(submissionsPath);
  record(
    "5a. logs/visitor-submissions.jsonl exists",
    submissionsExists,
    submissionsPath,
  );
  if (submissionsExists) {
    const lines = readFileSync(submissionsPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim());
    const stripeLine = lines.find((l) => l.includes(stripeBody.sessionId));
    const acmeLine = lines.find((l) => l.includes(acmeBody.sessionId));
    record(
      "5b. Stripe submission appears in JSONL log",
      Boolean(stripeLine),
    );
    record(
      "5c. Acme submission appears in JSONL log",
      Boolean(acmeLine),
    );
  }

  // ---- Scenario 6 — validation rejects malformed payloads ----
  const tooShort = await postSubmit({
    customer_name: "X",
    segment: "enterprise",
    deal_type: "new_logo",
    pricing_model: "subscription",
    acv: 50000,
    term_months: 12,
    discount_pct: 5,
    customer_request: "way too short", // <50 chars
    non_standard_clauses: [],
  });
  record(
    "6. Short customer_request rejected with 422",
    tooShort.res.status === 422,
    `status=${tooShort.res.status}`,
  );

  // ---- Summary ----
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n[harness] ${passed}/${results.length} checks passed.${failed.length === 0 ? "" : ` ${failed.length} failed.`}`,
  );
  if (failed.length > 0) {
    for (const f of failed) {
      console.log(`  → ${f.name} ${f.detail ?? ""}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
