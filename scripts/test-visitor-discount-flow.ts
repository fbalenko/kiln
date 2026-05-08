// End-to-end verification that the visitor flow respects the submitted
// discount_pct from form → SQL → orchestrator → agents → review row.
//
// For each discount in [30, 5, 50]:
//   1. mint a fresh session by hitting /api/submit-deal without a cookie
//   2. consume the SSE /api/run-review/visitor-{id} until "synthesis"
//   3. read the persisted deal_reviews row
//   4. assert pricing_output_json.list_price / proposed_price match SQL
//   5. assert effective_discount_pct ≈ submitted discount
//   6. assert synthesis mentions the discount as a percentage string
//
// Plus one re-submit case to prove the cache-invalidation fix:
//   • submit at 30 (session A), run, wait
//   • re-submit at 5 with session A's cookie (same dealId), run, wait
//   • the second review's outputs reflect 5%, not the cached 30%
//
// Budget: ~4 live orchestrator runs at $0.20–$0.50 each ≈ $2.

import { getDb } from "@/lib/db/client";
import {
  PricingOutputSchema,
  type PricingOutput,
} from "@/lib/agents/schemas";

const BASE = process.env.KILN_BASE_URL ?? "http://localhost:3000";

interface SubmitOk {
  ok: true;
  sessionId: string;
  dealId: string;
}

interface DealReviewRow {
  id: string;
  deal_id: string;
  pricing_output_json: string;
  synthesis_summary: string;
  is_visitor_submitted: number;
  slack_post_status: string | null;
}

interface DealRow {
  id: string;
  list_price: number;
  proposed_price: number;
  discount_pct: number;
}

const results: { name: string; ok: boolean; detail?: string }[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function basePayload(customerName: string, discountPct: number) {
  return {
    customer_name: customerName,
    customer_domain: "",
    segment: "enterprise",
    deal_type: "expansion",
    pricing_model: "subscription",
    acv: 480000,
    term_months: 24,
    discount_pct: discountPct,
    discount_reason: "Multi-year commit + competitive replacement.",
    non_standard_clauses: [],
    customer_request:
      "Customer is consolidating from three vendors. They want a 2-year commit with quarterly true-ups, a discount tied to multi-year, and EU data residency. Decision by end of quarter; competitive trial running with a smaller vendor.",
    competitive_context:
      "Apollo is the incumbent. Customer flagged price as the primary blocker.",
  };
}

async function submitDeal(
  payload: ReturnType<typeof basePayload>,
  cookie?: string | null,
): Promise<{ body: SubmitOk; cookie: string | null }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers["cookie"] = cookie;
  const res = await fetch(`${BASE}/api/submit-deal`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`submit-deal failed: ${res.status} ${txt}`);
  }
  const body = (await res.json()) as SubmitOk;
  const setCookies =
    (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    null;
  const cookieLine = setCookies?.[0] ?? res.headers.get("set-cookie");
  const cookieValue = cookieLine ? cookieLine.split(";")[0] : null;
  return { body, cookie: cookieValue };
}

// Drives the SSE stream for a deal's review; resolves when the
// "synthesis" event arrives. Throws on "error" event.
async function runReviewToCompletion(
  dealId: string,
): Promise<{ reviewId: string; durationMs: number }> {
  const start = Date.now();
  const res = await fetch(`${BASE}/api/run-review/${dealId}`);
  if (!res.ok) throw new Error(`run-review HTTP ${res.status}`);
  if (!res.body) throw new Error("no response body");

  const decoder = new TextDecoder();
  let buf = "";
  let reviewId: string | null = null;

  const reader = res.body.getReader();
  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const eventBlock = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of eventBlock.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6);
        let parsed: { type?: string; review_id?: string; message?: string };
        try {
          parsed = JSON.parse(json);
        } catch {
          continue;
        }
        if (parsed.type === "synthesis" && parsed.review_id) {
          reviewId = parsed.review_id;
          break outer;
        }
        if (parsed.type === "error") {
          throw new Error(`orchestrator error: ${parsed.message ?? "?"}`);
        }
      }
    }
  }
  if (!reviewId) throw new Error("stream closed without synthesis event");
  return { reviewId, durationMs: Date.now() - start };
}

function readDealRow(dealId: string): DealRow | null {
  const row = getDb()
    .prepare(
      "SELECT id, list_price, proposed_price, discount_pct FROM deals WHERE id = ?",
    )
    .get(dealId) as DealRow | undefined;
  return row ?? null;
}

function readLatestReview(dealId: string): DealReviewRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, deal_id, pricing_output_json, synthesis_summary,
              is_visitor_submitted, slack_post_status
       FROM deal_reviews
       WHERE deal_id = ?
       ORDER BY ran_at DESC LIMIT 1`,
    )
    .get(dealId) as DealReviewRow | undefined;
  return row ?? null;
}

async function verifySubmission(
  label: string,
  customerName: string,
  discountPct: number,
  options: { reuseCookie?: string | null } = {},
): Promise<{ dealId: string; reviewId: string; cookie: string | null }> {
  console.log(`\n--- ${label} (discount=${discountPct}%) ---`);
  const submitted = await submitDeal(
    basePayload(customerName, discountPct),
    options.reuseCookie ?? undefined,
  );
  const { dealId, sessionId } = submitted.body;
  check(`${label}.a sessionId returned`, typeof sessionId === "string", sessionId);

  const sqlDeal = readDealRow(dealId);
  check(
    `${label}.b SQL deal row exists with correct discount`,
    sqlDeal != null && Math.abs(sqlDeal.discount_pct - discountPct) < 0.01,
    sqlDeal ? `discount_pct=${sqlDeal.discount_pct}` : "no row",
  );
  const expectedProposed = Math.round(480000 * (1 - discountPct / 100));
  check(
    `${label}.c SQL proposed_price = list × (1 - discount)`,
    sqlDeal != null && Math.round(sqlDeal.proposed_price) === expectedProposed,
    `proposed=${sqlDeal?.proposed_price} expected=${expectedProposed}`,
  );

  console.log(`[${label}] firing orchestrator (this takes ~60s)…`);
  const run = await runReviewToCompletion(dealId);
  console.log(
    `[${label}] orchestrator finished in ${(run.durationMs / 1000).toFixed(1)}s`,
  );

  const review = readLatestReview(dealId);
  check(`${label}.d deal_reviews row created`, review != null, review?.id);
  check(
    `${label}.e is_visitor_submitted = 1`,
    review?.is_visitor_submitted === 1,
    `flag=${review?.is_visitor_submitted}`,
  );

  if (review) {
    let pricing: PricingOutput | null = null;
    try {
      pricing = PricingOutputSchema.parse(JSON.parse(review.pricing_output_json));
    } catch (err) {
      check(
        `${label}.f pricing JSON parses against schema`,
        false,
        err instanceof Error ? err.message : String(err),
      );
    }
    if (pricing && sqlDeal) {
      check(
        `${label}.f pricing.list_price matches SQL list_price`,
        Math.round(pricing.list_price) === Math.round(sqlDeal.list_price),
        `agent.list=${pricing.list_price} sql.list=${sqlDeal.list_price}`,
      );
      check(
        `${label}.g pricing.proposed_price matches SQL proposed_price`,
        Math.round(pricing.proposed_price) === Math.round(sqlDeal.proposed_price),
        `agent.prop=${pricing.proposed_price} sql.prop=${sqlDeal.proposed_price}`,
      );
      check(
        `${label}.h pricing.effective_discount_pct ≈ submitted discount`,
        Math.abs(pricing.effective_discount_pct - discountPct) < 0.51,
        `agent.discount=${pricing.effective_discount_pct} submitted=${discountPct}`,
      );
    }

    // Synthesis sanity: it should mention the discount in some form.
    const syn = review.synthesis_summary.toLowerCase();
    const expected = `${discountPct}%`;
    check(
      `${label}.i synthesis mentions ${expected}`,
      syn.includes(expected) ||
        syn.includes(`${discountPct} %`) ||
        syn.includes(`${discountPct} percent`),
      `synthesis="${review.synthesis_summary.slice(0, 220)}…"`,
    );
  }

  return { dealId, reviewId: review?.id ?? "", cookie: submitted.cookie };
}

async function main() {
  console.log(`[harness] base url: ${BASE}`);

  // ---- Three fresh-session submissions at 30 / 5 / 50 ----
  await verifySubmission("T1 fresh-30", "Bridge Pay", 30);
  await verifySubmission("T2 fresh-5", "Helix Sciences", 5);
  await verifySubmission("T3 fresh-50", "Mercury Labs", 50);

  // ---- One re-submit case proving cache invalidation ----
  const t4a = await verifySubmission("T4a same-session-first-30", "Lattice Co", 30);
  await verifySubmission("T4b same-session-resubmit-5", "Lattice Co", 5, {
    reuseCookie: t4a.cookie,
  });

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
