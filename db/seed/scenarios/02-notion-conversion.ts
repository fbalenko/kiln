import type { ScenarioBundle } from "./types";

// Hero Scenario 2 — Notion self-serve to enterprise conversion.
// Highlights: ASC 606 agent (rollover credits = variable consideration).

const customerRequest =
  "Notion's RevOps team wants to consolidate 14 individual Pro seats and a separate Team plan into one enterprise contract. They're asking for: (1) any unused API call credits to roll over month-to-month within the contract year — they have lumpy usage and don't want to over-pay or under-purchase, (2) annual billing with quarterly true-up, (3) 4 sandbox tenants for free included with the enterprise plan. AE has soft-committed to rollover. The customer says 'we'd like to start in two weeks if we can land this.'";

const competitiveContext =
  "Notion is evaluating Clearbit Enterprise as a fallback but heavily prefers Clay based on existing self-serve usage. Their RevOps lead is the champion. Decision velocity is the key risk — they want to start in two weeks.";

const nonStandard = JSON.stringify([
  "rollover_credits_within_contract_year",
  "quarterly_true_up",
  "sandbox_tenants_included_free",
]);

export const notionConversion: ScenarioBundle = {
  deal: {
    id: "deal_notion_2026_enterprise_conversion",
    customer_id: "cust_notion",
    name: "Self-Serve to Enterprise Conversion",
    deal_type: "expansion",
    stage: "review",
    acv: 180_000,
    tcv: 360_000,
    term_months: 24,
    ramp_schedule_json: null,
    list_price: 200_000,
    proposed_price: 180_000,
    discount_pct: 10.0,
    discount_reason:
      "Multi-year commit + consolidation of 14 self-serve seats and Team plan into single enterprise contract.",
    payment_terms: "annual_upfront",
    payment_terms_notes:
      "Annual upfront billing with quarterly true-up against actual usage; reconciliation invoiced/credited each quarter.",
    pricing_model: "hybrid",
    usage_commit_units: 1_500_000,
    overage_rate: 0.0008,
    non_standard_clauses: nonStandard,
    ae_owner: "Devon Wright",
    ae_manager: "Sarah Goldstein",
    competitive_context: competitiveContext,
    customer_request: customerRequest,
    close_date: "2026-05-18",
    is_scenario: 1,
  },
  meta: {
    deal_id: "deal_notion_2026_enterprise_conversion",
    display_order: 2,
    is_recommended: 0,
    hero_tagline:
      "PLG customer scaling to $180K/year — but their request changes the rev rec story",
    difficulty_label: "medium",
    estimated_review_time_seconds: 55,
  },
};
