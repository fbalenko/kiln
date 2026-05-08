import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { getDb } from "./client";
import { buildEmbeddingText } from "./embeddings";
import type { VisitorSubmitInput } from "@/lib/visitor-submit/schema";
import { normalizeDomain } from "@/lib/visitor-submit/schema";
import {
  ApprovalOutputSchema,
  Asc606OutputSchema,
  CommsOutputSchema,
  PricingOutputSchema,
  RedlineOutputSchema,
} from "@/lib/agents/schemas";
import type { OrchestratorCacheFile } from "@/lib/agents/orchestrator";
import { clearVisitorReviewCache } from "@/lib/visitor-submit/store";

// SQLite-side persistence for visitor-submitted deals. Lives in its own
// module so the API route + the visitor-store cleanup hook can share
// helpers without re-importing the embedding pipeline.
//
// Identity convention:
//   • dealId      = `visitor-${sessionId}`
//   • customerId  = `visitor-cust-${sessionId}`
// One sessionId → one in-flight deal. If a visitor re-submits within the
// same session, we drop the prior deal (cascade to embeddings + reviews
// + audit log) and insert fresh, so the cookie always points at the
// most recent submission.

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;

export interface InsertVisitorDealResult {
  dealId: string;
  customerId: string;
}

export async function insertVisitorDeal(
  sessionId: string,
  input: VisitorSubmitInput,
): Promise<InsertVisitorDealResult> {
  const dealId = `visitor-${sessionId}`;
  const customerId = `visitor-cust-${sessionId}`;
  const db = getDb();

  // If this session already has an in-flight deal (re-submit during the
  // same cookie window), drop everything tied to the old deal so the
  // FK chain stays clean.
  deleteVisitorDealInner(dealId, customerId);

  const domain =
    normalizeDomain(input.customer_domain) ??
    `${slugify(input.customer_name)}.example`;
  const segment = input.segment;
  const employeeCount = guessEmployeeCount(segment);
  const industry = "Software & technology";
  const hqCountry = "US";
  // Visitor-submitted customers are simulated unless their domain
  // resolves to a real company — we treat them as fictional by default
  // so Exa doesn't return unrelated results for the (likely-novel)
  // company name. The signals fetcher's `empty_unknown` branch handles
  // this gracefully.
  const isReal = 0;

  const acv = Math.round(input.acv);
  const term = input.term_months;
  const tcv = Math.round(acv * (term / 12));
  const listPrice = acv;
  const proposedPrice = Math.round(acv * (1 - input.discount_pct / 100));

  const clausesJson =
    input.non_standard_clauses.length > 0
      ? JSON.stringify(input.non_standard_clauses)
      : null;

  const insertCustomer = db.prepare(`
    INSERT INTO customers (
      id, name, domain, segment, employee_count, industry, hq_country,
      funding_stage, arr_estimate, health_score, is_real, simulated_signals
    ) VALUES (
      @id, @name, @domain, @segment, @employee_count, @industry, @hq_country,
      NULL, NULL, NULL, @is_real, NULL
    )
  `);

  const insertDeal = db.prepare(`
    INSERT INTO deals (
      id, customer_id, name, deal_type, stage, acv, tcv, term_months,
      ramp_schedule_json, list_price, proposed_price, discount_pct,
      discount_reason, payment_terms, payment_terms_notes, pricing_model,
      usage_commit_units, overage_rate, non_standard_clauses,
      ae_owner, ae_manager, competitive_context, customer_request,
      close_date, is_scenario
    ) VALUES (
      @id, @customer_id, @name, @deal_type, @stage, @acv, @tcv, @term_months,
      NULL, @list_price, @proposed_price, @discount_pct,
      @discount_reason, 'net_30', NULL, @pricing_model,
      NULL, NULL, @non_standard_clauses,
      @ae_owner, @ae_manager, @competitive_context, @customer_request,
      NULL, 0
    )
  `);

  const tx = db.transaction(() => {
    insertCustomer.run({
      id: customerId,
      name: input.customer_name,
      domain,
      segment,
      employee_count: employeeCount,
      industry,
      hq_country: hqCountry,
      is_real: isReal,
    });
    insertDeal.run({
      id: dealId,
      customer_id: customerId,
      name: synthesizeDealName(input),
      deal_type: input.deal_type,
      stage: "review",
      acv,
      tcv,
      term_months: term,
      list_price: listPrice,
      proposed_price: proposedPrice,
      discount_pct: input.discount_pct,
      discount_reason: input.discount_reason ?? null,
      pricing_model: input.pricing_model,
      non_standard_clauses: clausesJson,
      ae_owner: "Visitor",
      ae_manager: "Visitor",
      competitive_context: input.competitive_context ?? null,
      customer_request: input.customer_request,
    });
  });
  tx();

  // Embed the deal so vector k-NN can find similar past scenarios. We
  // surface a plain console warning if OpenAI rejects the request — the
  // orchestrator's vector-search path already handles a missing
  // embedding row by returning [] from findSimilarDeals.
  try {
    await embedVisitorDeal(dealId, {
      customerName: input.customer_name,
      segment,
      industry,
      employeeCount,
      input,
    });
  } catch (err) {
    console.warn(
      `[visitor-deals] embedding failed for ${dealId}:`,
      err instanceof Error ? err.message : err,
    );
  }

  return { dealId, customerId };
}

interface EmbedVisitorDealArgs {
  customerName: string;
  segment: string;
  industry: string;
  employeeCount: number;
  input: VisitorSubmitInput;
}

async function embedVisitorDeal(
  dealId: string,
  args: EmbedVisitorDealArgs,
): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    // Without OpenAI, vector k-NN simply returns [] for this deal —
    // a degraded but coherent demo path.
    return;
  }
  const text = buildEmbeddingText({
    id: dealId,
    customer_id: "",
    customer_name: args.customerName,
    segment: args.segment,
    industry: args.industry,
    employee_count: args.employeeCount,
    deal_type: args.input.deal_type,
    acv: args.input.acv,
    term_months: args.input.term_months,
    pricing_model: args.input.pricing_model,
    discount_pct: args.input.discount_pct,
    discount_reason: args.input.discount_reason ?? null,
    non_standard_clauses:
      args.input.non_standard_clauses.length > 0
        ? JSON.stringify(args.input.non_standard_clauses)
        : null,
    customer_request: args.input.customer_request,
    competitive_context: args.input.competitive_context ?? null,
  });

  const client = new OpenAI();
  const resp = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  const vec = resp.data[0]?.embedding;
  if (!vec || vec.length !== EMBEDDING_DIMS) {
    throw new Error(
      `Unexpected embedding shape (got ${vec?.length ?? "null"}).`,
    );
  }
  const buf = Buffer.from(new Float32Array(vec).buffer);
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM deal_embeddings WHERE deal_id = ?").run(dealId);
    db.prepare(
      "INSERT INTO deal_embeddings (deal_id, embedding) VALUES (?, ?)",
    ).run(dealId, buf);
  })();
}

// Cascading delete used by both re-submit and the periodic visitor-
// store sweeper. Stays self-contained so the visitor-store module can
// import it without dragging the schema into its tree.
export function deleteVisitorDeal(dealId: string, customerId: string): void {
  deleteVisitorDealInner(dealId, customerId);
}

function deleteVisitorDealInner(dealId: string, customerId: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    // audit_log → deal_reviews → deal_embeddings → deals → customers.
    db.prepare(
      `DELETE FROM audit_log
       WHERE review_id IN (SELECT id FROM deal_reviews WHERE deal_id = ?)`,
    ).run(dealId);
    db.prepare("DELETE FROM deal_reviews WHERE deal_id = ?").run(dealId);
    db.prepare("DELETE FROM deal_embeddings WHERE deal_id = ?").run(dealId);
    db.prepare("DELETE FROM deals WHERE id = ?").run(dealId);
    db.prepare("DELETE FROM customers WHERE id = ?").run(customerId);
  });
  tx();

  // Critical: drop the in-memory orchestrator cache for this dealId
  // alongside the SQL rows. Without this, a re-submit within the same
  // cookie window (which keeps the same `visitor-{sessionId}` dealId)
  // would serve the prior run's cached pricing/agent outputs instead
  // of running fresh on the new deal data. That was the root cause of
  // the "submitted at 30%, page shows 15%" bug.
  clearVisitorReviewCache(dealId);
}

// Returns the most recent deal_reviews row for a deal id, or null. Used
// by the visitor deal page to decide between "auto-fire orchestrator"
// (no row yet) and "hydrate from existing review" (refresh after a run).
export function getLatestReviewIdForDeal(dealId: string): string | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id FROM deal_reviews WHERE deal_id = ? ORDER BY ran_at DESC LIMIT 1",
    )
    .get(dealId) as { id: string } | undefined;
  return row?.id ?? null;
}

// Reconstruct an OrchestratorCacheFile from the most recent deal_reviews
// row for a deal. Used as a cold-start fallback for visitor deals: when
// the in-memory cache is gone (process restart) but a review row still
// exists, the orchestrator hydrates from SQL instead of re-firing LLMs.
//
// Timings come back as a single virtual entry per parent so replay
// completes instantly — the substep tape isn't persisted to SQL, so we
// don't try to fake one. The deal-detail UI's per-agent cards still
// hydrate from the structured output payload.
export function rebuildOrchestratorCacheFromLatestReview(
  dealId: string,
): OrchestratorCacheFile | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         id, deal_id, ran_at,
         pricing_output_json, asc606_output_json, redline_output_json,
         approval_output_json, comms_output_json,
         similar_deals_json, customer_signals_json,
         synthesis_summary, total_runtime_ms, total_tokens_used,
         slack_channel, slack_thread_ts, slack_posted_at, slack_permalink,
         slack_post_status, slack_post_reason, slack_post_error
       FROM deal_reviews
       WHERE deal_id = ?
       ORDER BY ran_at DESC LIMIT 1`,
    )
    .get(dealId) as
    | {
        id: string;
        ran_at: string;
        pricing_output_json: string;
        asc606_output_json: string;
        redline_output_json: string;
        approval_output_json: string;
        comms_output_json: string;
        similar_deals_json: string;
        customer_signals_json: string;
        synthesis_summary: string;
        total_runtime_ms: number;
        total_tokens_used: number | null;
        slack_channel: string | null;
        slack_thread_ts: string | null;
        slack_posted_at: string | null;
        slack_permalink: string | null;
        slack_post_status: string | null;
        slack_post_reason: string | null;
        slack_post_error: string | null;
      }
    | undefined;
  if (!row) return null;

  let pricing, asc606, redline, approval, comms, similar, signals;
  try {
    pricing = PricingOutputSchema.parse(JSON.parse(row.pricing_output_json));
    asc606 = Asc606OutputSchema.parse(JSON.parse(row.asc606_output_json));
    redline = RedlineOutputSchema.parse(JSON.parse(row.redline_output_json));
    approval = ApprovalOutputSchema.parse(JSON.parse(row.approval_output_json));
    comms = CommsOutputSchema.parse(JSON.parse(row.comms_output_json));
    similar = JSON.parse(row.similar_deals_json) as OrchestratorCacheFile["similar_deals"];
    signals = JSON.parse(row.customer_signals_json) as OrchestratorCacheFile["customer_signals"];
  } catch (err) {
    console.warn(
      `[visitor-deals] rebuild from deal_reviews failed for ${dealId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  return {
    version: 4,
    deal_id: dealId,
    outputs: { pricing, asc606, redline, approval, comms },
    synthesis: row.synthesis_summary,
    similar_deals: similar,
    customer_signals: signals,
    slack_post_result: {
      // A prior run already posted (or tried to) — flip "success" to
      // "cached" so the UI doesn't claim a fresh post happened.
      status:
        row.slack_post_status === "success"
          ? "cached"
          : ((row.slack_post_status ?? "skipped") as
              | "success"
              | "failed"
              | "skipped"
              | "cached"),
      channel: row.slack_channel,
      thread_ts: row.slack_thread_ts,
      posted_at: row.slack_posted_at,
      permalink: row.slack_permalink,
      reason: (row.slack_post_reason ?? null) as null,
      error: row.slack_post_error,
    },
    // Empty timings → replay completes immediately. The per-agent cards
    // hydrate from the structured outputs without animation, which is
    // the right UX for "you already saw this run, just refresh."
    timings: [],
    metadata: {
      duration_ms: row.total_runtime_ms,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cost_usd: 0,
      recorded_at: row.ran_at,
      per_agent: {
        pricing: emptyMeta(),
        asc606: emptyMeta(),
        redline: emptyMeta(),
        approval: emptyMeta(),
        comms: emptyMeta(),
        synthesis: emptyMeta(),
      },
    },
  };
}

function emptyMeta() {
  return {
    duration_ms: 0,
    input_tokens: null,
    output_tokens: null,
    cost_usd: null,
  };
}

// ---- helpers --------------------------------------------------------------

export function newSessionId(): string {
  return randomUUID();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "visitor";
}

// Rough employee-count anchor per segment. The orchestrator uses
// employee_count to scale guardrail logic (e.g. enterprise vs PLG
// thresholds), so a reasonable default keeps the agents on the right
// segment branch. Visitors who care about a precise count can re-submit
// with a different segment.
function guessEmployeeCount(segment: string): number {
  switch (segment) {
    case "enterprise":
      return 5000;
    case "mid_market":
      return 350;
    case "plg_self_serve":
      return 50;
    default:
      return 200;
  }
}

function synthesizeDealName(input: VisitorSubmitInput): string {
  const year = new Date().getFullYear();
  const typeLabel = (() => {
    switch (input.deal_type) {
      case "new_logo":
        return "new-logo";
      case "expansion":
        return "expansion";
      case "renewal":
        return "renewal";
      case "partnership":
        return "partnership";
    }
  })();
  return `${year} ${typeLabel} (visitor)`;
}
