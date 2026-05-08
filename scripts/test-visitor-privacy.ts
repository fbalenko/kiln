// Verifies visitor submissions are excluded from public dashboard /
// pipeline surfaces after the privacy fix. Submits 2 fresh visitor
// deals with small ACV so the LLM cost stays under ~$1 total, then
// asserts:
//   1. listDeals() returns 40 (seeded count) and contains no visitor- ids
//   2. getRecentActivity() contains no entries with visitor- dealIds
//   3. getLastActivityByDeal() contains no visitor- keys
//   4. The pipeline page HTML doesn't render any visitor- row links
//   5. The dashboard page HTML doesn't render any visitor- row links
//      in the activity feed
//   6. The visitor's OWN /deals/visitor-{id} page (with cookie) still
//      works — privacy filter doesn't break the cookie-protected path
// Then cleans up the visitor rows so committed state is pristine.

import { getDb } from "@/lib/db/client";
import { listDeals } from "@/lib/db/queries";
import { getRecentActivity } from "@/lib/dashboard/activity-feed";
import { getLastActivityByDeal } from "@/lib/pipeline/last-activity";

const BASE = process.env.KILN_BASE_URL ?? "http://localhost:3000";

interface SubmitOk {
  ok: true;
  sessionId: string;
  dealId: string;
}

const results: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function basePayload(name: string, discount: number) {
  return {
    customer_name: name,
    customer_domain: "",
    segment: "mid_market",
    deal_type: "new_logo",
    pricing_model: "subscription",
    acv: 50000,
    term_months: 12,
    discount_pct: discount,
    discount_reason: "Privacy filter smoke test.",
    non_standard_clauses: [],
    customer_request:
      "Synthetic submission used to verify that visitor deals stay private and don't leak into the public dashboard activity feed or pipeline list. Small ACV to keep LLM cost low.",
    competitive_context: "",
  };
}

async function submit(
  payload: ReturnType<typeof basePayload>,
): Promise<{ body: SubmitOk; cookie: string | null }> {
  const res = await fetch(`${BASE}/api/submit-deal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`submit failed ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as SubmitOk;
  const setCookies =
    (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? null;
  const line = setCookies?.[0] ?? res.headers.get("set-cookie");
  const cookie = line ? line.split(";")[0] : null;
  return { body, cookie };
}

async function runReviewToCompletion(dealId: string): Promise<string> {
  const res = await fetch(`${BASE}/api/run-review/${dealId}`);
  if (!res.body) throw new Error("no body");
  const decoder = new TextDecoder();
  let buf = "";
  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const e = JSON.parse(line.slice(6));
          if (e.type === "synthesis" && e.review_id) return e.review_id as string;
          if (e.type === "error") throw new Error(e.message ?? "agent error");
        } catch {}
      }
    }
  }
  throw new Error("stream closed without synthesis");
}

async function fetchHtml(path: string, cookie?: string | null): Promise<{ status: number; html: string }> {
  const headers: Record<string, string> = {};
  if (cookie) headers["cookie"] = cookie;
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", headers });
  return { status: res.status, html: await res.text() };
}

function cleanupVisitorRows(): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(
      `DELETE FROM audit_log
       WHERE review_id IN (SELECT id FROM deal_reviews WHERE deal_id LIKE 'visitor-%')`,
    ).run();
    db.prepare("DELETE FROM deal_reviews WHERE deal_id LIKE 'visitor-%'").run();
    db.prepare("DELETE FROM deal_embeddings WHERE deal_id LIKE 'visitor-%'").run();
    db.prepare("DELETE FROM deals WHERE id LIKE 'visitor-%'").run();
    db.prepare("DELETE FROM customers WHERE id LIKE 'visitor-cust-%'").run();
  });
  tx();
}

async function main() {
  console.log("[harness] starting privacy filter verification");
  console.log("[harness] cleaning any prior visitor rows…");
  cleanupVisitorRows();

  // ---- Submit 2 visitor deals ----
  console.log("\n--- submit + run V1 ---");
  const v1 = await submit(basePayload("Privacy Test One", 10));
  console.log(`v1.dealId=${v1.body.dealId}`);
  const v1Review = await runReviewToCompletion(v1.body.dealId);
  console.log(`v1.reviewId=${v1Review}`);

  console.log("\n--- submit + run V2 ---");
  const v2 = await submit(basePayload("Privacy Test Two", 25));
  console.log(`v2.dealId=${v2.body.dealId}`);
  const v2Review = await runReviewToCompletion(v2.body.dealId);
  console.log(`v2.reviewId=${v2Review}`);

  // ---- 1. listDeals returns 40 (seeded) and no visitor-* ids ----
  const allDeals = listDeals();
  const visitorInList = allDeals.filter((d) => d.id.startsWith("visitor-"));
  check(
    `1. listDeals() excludes visitor deals (got ${allDeals.length} total)`,
    allDeals.length === 40 && visitorInList.length === 0,
    `total=${allDeals.length} visitor=${visitorInList.length}`,
  );

  // ---- 2. getRecentActivity() has no visitor entries ----
  const activity = getRecentActivity(20);
  const visitorInActivity = activity.filter((e) => e.dealId.startsWith("visitor-"));
  check(
    `2. getRecentActivity() excludes visitor reviews (got ${activity.length} entries)`,
    visitorInActivity.length === 0,
    `visitor count=${visitorInActivity.length}`,
  );

  // ---- 3. getLastActivityByDeal() has no visitor keys ----
  const lastActivity = getLastActivityByDeal();
  const visitorInLastActivity = Array.from(lastActivity.keys()).filter((k) =>
    k.startsWith("visitor-"),
  );
  check(
    `3. getLastActivityByDeal() excludes visitor deals (${lastActivity.size} keys)`,
    visitorInLastActivity.length === 0,
    `visitor keys=${visitorInLastActivity.length}`,
  );

  // ---- 4. /pipeline HTML has no visitor- href ----
  const pipeline = await fetchHtml("/pipeline");
  const pipelineHasVisitor = /\/deals\/visitor-/.test(pipeline.html);
  check(
    `4. /pipeline HTML doesn't link to any visitor- deals`,
    pipeline.status === 200 && !pipelineHasVisitor,
    `status=${pipeline.status} hasVisitor=${pipelineHasVisitor}`,
  );

  // ---- 5. / (dashboard) HTML has no visitor- href in activity rows ----
  const home = await fetchHtml("/");
  const homeHasVisitor = /\/deals\/visitor-/.test(home.html);
  check(
    `5. / dashboard doesn't link to any visitor- deals`,
    home.status === 200 && !homeHasVisitor,
    `status=${home.status} hasVisitor=${homeHasVisitor}`,
  );

  // ---- 6. Visitor's own /deals/visitor-{id} still works WITH cookie ----
  // (the privacy filter must not break the cookie-protected page.)
  const v2Page = await fetchHtml(`/deals/${v2.body.dealId}`, v2.cookie);
  check(
    `6a. /deals/{visitorId} renders 200 for the cookie owner`,
    v2Page.status === 200,
    `status=${v2Page.status}`,
  );
  check(
    `6b. visitor's own page shows their customer name`,
    v2Page.html.includes("Privacy Test Two"),
  );

  // ---- 7. KPI counts only reflect seeded deals ----
  // listDeals returned 40 above, and the dashboard's "in review" tile
  // counts deals where stage != closed_*. Seeded deals are a known
  // mix, but the key invariant: total seen by KPI logic === listDeals
  // length === 40 (not 42 with the 2 visitor submissions).
  const inReview = allDeals.filter(
    (d) => d.stage !== "closed_won" && d.stage !== "closed_lost",
  );
  check(
    `7. "in review" KPI scope === non-visitor only (got ${inReview.length})`,
    inReview.every((d) => !d.id.startsWith("visitor-")),
  );

  // ---- 8. Cleanup ----
  console.log("\n[harness] cleaning visitor rows…");
  cleanupVisitorRows();
  const visitorRowsAfter = (
    getDb()
      .prepare(
        "SELECT COUNT(*) AS n FROM deals WHERE id LIKE 'visitor-%'",
      )
      .get() as { n: number }
  ).n;
  check(
    `8. cleanup removed all visitor deals`,
    visitorRowsAfter === 0,
    `remaining=${visitorRowsAfter}`,
  );

  // ---- Summary ----
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n[harness] ${passed}/${results.length} checks passed.${failed.length === 0 ? "" : ` ${failed.length} failed.`}`,
  );
  if (failed.length > 0) {
    for (const f of failed) console.log(`  → ${f.name} ${f.detail ?? ""}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  console.log("[harness] attempting cleanup despite failure…");
  try {
    cleanupVisitorRows();
  } catch {}
  process.exit(1);
});
