import { getDb } from "./client";
import { getVisitorDealRecord } from "@/lib/visitor-submit/store";

export type Customer = {
  id: string;
  name: string;
  domain: string;
  segment: "enterprise" | "mid_market" | "plg_self_serve";
  employee_count: number;
  industry: string;
  hq_country: string;
  funding_stage: string | null;
  arr_estimate: number | null;
  health_score: number | null;
  is_real: number;
  // JSON array of simulated signals (matches CustomerSignal[]). Only set for
  // fictional customers we hand-author signals for. Real customers ignore this.
  simulated_signals: string | null;
  created_at: string;
};

export type Deal = {
  id: string;
  customer_id: string;
  name: string;
  deal_type: "new_logo" | "expansion" | "renewal" | "partnership";
  stage:
    | "discovery"
    | "proposal"
    | "negotiation"
    | "review"
    | "closed_won"
    | "closed_lost";
  acv: number;
  tcv: number;
  term_months: number;
  ramp_schedule_json: string | null;
  list_price: number;
  proposed_price: number;
  discount_pct: number;
  discount_reason: string | null;
  payment_terms: string;
  payment_terms_notes: string | null;
  pricing_model: "subscription" | "usage_based" | "hybrid" | "one_time";
  usage_commit_units: number | null;
  overage_rate: number | null;
  non_standard_clauses: string | null;
  ae_owner: string;
  ae_manager: string;
  competitive_context: string | null;
  customer_request: string;
  created_at: string;
  close_date: string | null;
  is_scenario: number;
};

export type DealWithCustomer = Deal & {
  customer: Customer;
  scenario_meta: ScenarioMeta | null;
};

export type ScenarioMeta = {
  deal_id: string;
  display_order: number;
  is_recommended: number;
  hero_tagline: string;
  difficulty_label: "medium" | "high" | "expert";
  estimated_review_time_seconds: number;
};

export type ApprovalMatrixRule = {
  id: string;
  rule_name: string;
  condition_json: string;
  required_approver_role: string;
  rule_priority: number;
  is_default: number;
  notes: string | null;
};

export type PricingGuardrail = {
  id: string;
  rule_name: string;
  applies_to_segment: string | null;
  metric: string;
  operator: string;
  threshold_value: number;
  severity: string;
  notes: string | null;
};

// Visitor-submitted deals carry the `visitor-` id prefix and live in the
// same `deals` table as the seeded scenarios. listDeals() is the public
// pipeline + dashboard lister, so visitor rows must be excluded — both
// for privacy (Visitor A's deal would otherwise appear on Visitor B's
// homepage) and demo coherence (the pipeline is meant to surface the
// 40 seeded deals only). getDealById() stays unfiltered so a visitor
// can still fetch their own deal via /deals/visitor-{id}.
const EXCLUDE_VISITOR_DEALS = "d.id NOT LIKE 'visitor-%'";

export function listDeals(): DealWithCustomer[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        d.*,
        c.id AS c_id,
        c.name AS c_name,
        c.domain AS c_domain,
        c.segment AS c_segment,
        c.employee_count AS c_employee_count,
        c.industry AS c_industry,
        c.hq_country AS c_hq_country,
        c.funding_stage AS c_funding_stage,
        c.arr_estimate AS c_arr_estimate,
        c.health_score AS c_health_score,
        c.is_real AS c_is_real,
        c.simulated_signals AS c_simulated_signals,
        c.created_at AS c_created_at,
        s.display_order AS s_display_order,
        s.is_recommended AS s_is_recommended,
        s.hero_tagline AS s_hero_tagline,
        s.difficulty_label AS s_difficulty_label,
        s.estimated_review_time_seconds AS s_estimated_review_time_seconds
      FROM deals d
      JOIN customers c ON c.id = d.customer_id
      LEFT JOIN scenario_metadata s ON s.deal_id = d.id
      WHERE ${EXCLUDE_VISITOR_DEALS}
      ORDER BY
        CASE WHEN d.is_scenario = 1 THEN 0 ELSE 1 END,
        s.display_order ASC,
        d.created_at DESC
      `,
    )
    .all() as Record<string, unknown>[];

  return rows.map(reshapeDealRow);
}

const VISITOR_PREFIX = "visitor-";

export function getDealById(id: string): DealWithCustomer | null {
  // Visitor deals on Vercel live in process memory because the SQLite
  // file is mounted read-only there. Locally the in-memory store is
  // empty for the SQL-backed path, so the lookup falls through.
  if (id.startsWith(VISITOR_PREFIX)) {
    const inMemory = getVisitorDealRecord(id);
    if (inMemory) return inMemory.deal;
  }

  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT
        d.*,
        c.id AS c_id,
        c.name AS c_name,
        c.domain AS c_domain,
        c.segment AS c_segment,
        c.employee_count AS c_employee_count,
        c.industry AS c_industry,
        c.hq_country AS c_hq_country,
        c.funding_stage AS c_funding_stage,
        c.arr_estimate AS c_arr_estimate,
        c.health_score AS c_health_score,
        c.is_real AS c_is_real,
        c.simulated_signals AS c_simulated_signals,
        c.created_at AS c_created_at,
        s.display_order AS s_display_order,
        s.is_recommended AS s_is_recommended,
        s.hero_tagline AS s_hero_tagline,
        s.difficulty_label AS s_difficulty_label,
        s.estimated_review_time_seconds AS s_estimated_review_time_seconds
      FROM deals d
      JOIN customers c ON c.id = d.customer_id
      LEFT JOIN scenario_metadata s ON s.deal_id = d.id
      WHERE d.id = ?
      `,
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!row) return null;
  return reshapeDealRow(row);
}

export function getApprovalMatrix(): ApprovalMatrixRule[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM approval_matrix ORDER BY rule_priority ASC",
    )
    .all() as ApprovalMatrixRule[];
}

export function getPricingGuardrails(): PricingGuardrail[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM pricing_guardrails
       ORDER BY
         CASE applies_to_segment
           WHEN 'enterprise' THEN 1
           WHEN 'mid_market' THEN 2
           WHEN 'plg_self_serve' THEN 3
           ELSE 4
         END,
         metric ASC,
         severity ASC`,
    )
    .all() as PricingGuardrail[];
}

function reshapeDealRow(row: Record<string, unknown>): DealWithCustomer {
  const customer: Customer = {
    id: row.c_id as string,
    name: row.c_name as string,
    domain: row.c_domain as string,
    segment: row.c_segment as Customer["segment"],
    employee_count: row.c_employee_count as number,
    industry: row.c_industry as string,
    hq_country: row.c_hq_country as string,
    funding_stage: row.c_funding_stage as string | null,
    arr_estimate: row.c_arr_estimate as number | null,
    health_score: row.c_health_score as number | null,
    is_real: row.c_is_real as number,
    simulated_signals: row.c_simulated_signals as string | null,
    created_at: row.c_created_at as string,
  };

  const scenario_meta: ScenarioMeta | null =
    row.s_display_order != null
      ? {
          deal_id: row.id as string,
          display_order: row.s_display_order as number,
          is_recommended: row.s_is_recommended as number,
          hero_tagline: row.s_hero_tagline as string,
          difficulty_label:
            row.s_difficulty_label as ScenarioMeta["difficulty_label"],
          estimated_review_time_seconds:
            row.s_estimated_review_time_seconds as number,
        }
      : null;

  return {
    id: row.id as string,
    customer_id: row.customer_id as string,
    name: row.name as string,
    deal_type: row.deal_type as Deal["deal_type"],
    stage: row.stage as Deal["stage"],
    acv: row.acv as number,
    tcv: row.tcv as number,
    term_months: row.term_months as number,
    ramp_schedule_json: row.ramp_schedule_json as string | null,
    list_price: row.list_price as number,
    proposed_price: row.proposed_price as number,
    discount_pct: row.discount_pct as number,
    discount_reason: row.discount_reason as string | null,
    payment_terms: row.payment_terms as string,
    payment_terms_notes: row.payment_terms_notes as string | null,
    pricing_model: row.pricing_model as Deal["pricing_model"],
    usage_commit_units: row.usage_commit_units as number | null,
    overage_rate: row.overage_rate as number | null,
    non_standard_clauses: row.non_standard_clauses as string | null,
    ae_owner: row.ae_owner as string,
    ae_manager: row.ae_manager as string,
    competitive_context: row.competitive_context as string | null,
    customer_request: row.customer_request as string,
    created_at: row.created_at as string,
    close_date: row.close_date as string | null,
    is_scenario: row.is_scenario as number,
    customer,
    scenario_meta,
  };
}
