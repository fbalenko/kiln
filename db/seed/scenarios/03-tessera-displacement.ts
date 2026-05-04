import type { ScenarioBundle } from "./types";

// Hero Scenario 3 — Tessera Health competitive displacement, aggressive stack.
// Highlights: Pricing agent (effective discount math, alternative structures).

const customerRequest =
  "Tessera is currently using Apollo + Outreach + ZoomInfo, total spend ~$320K/yr. Their CRO wants to consolidate. AE has proposed 35% discount, 6 months free (paid term starts month 7), and waived implementation services (normally $40K). Customer is also asking for a 90-day out clause (uncommon for us) and wants to lock in 2026 pricing for any seat expansions through end of 2027. Three other vendors in the bake-off. Decision in 10 days.";

const competitiveContext =
  "Three other vendors in the bake-off — believed to include Apollo Enterprise (defensive incumbent) and a Clearbit/HubSpot-bundled offering. Tessera's CRO is the economic buyer; their RevOps lead is the technical evaluator.";

const nonStandard = JSON.stringify([
  "6mo_free_period_before_paid_term",
  "implementation_services_waived_40k",
  "out_clause_90_day_anytime",
  "expansion_pricing_lock_through_2027",
]);

// 6 months free, then full price from month 7. The annualized rate of
// $240K is paid only across months 7-24 (18 months), so monthly = $20K
// during paid period, $0 during free period.
const rampSchedule = JSON.stringify([
  { month: 1, amount: 0 },
  { month: 2, amount: 0 },
  { month: 3, amount: 0 },
  { month: 4, amount: 0 },
  { month: 5, amount: 0 },
  { month: 6, amount: 0 },
  { month: 7, amount: 20000 },
  { month: 8, amount: 20000 },
  { month: 9, amount: 20000 },
  { month: 10, amount: 20000 },
  { month: 11, amount: 20000 },
  { month: 12, amount: 20000 },
]);

export const tesseraDisplacement: ScenarioBundle = {
  deal: {
    id: "deal_tessera_2026_displacement",
    customer_id: "cust_tessera_health",
    name: "Apollo/Outreach/ZoomInfo Displacement",
    deal_type: "new_logo",
    stage: "review",
    acv: 240_000,
    tcv: 480_000,
    term_months: 24,
    ramp_schedule_json: rampSchedule,
    list_price: 360_000,
    proposed_price: 240_000,
    discount_pct: 35.0,
    discount_reason:
      "Competitive displacement of Apollo + Outreach + ZoomInfo stack ($320K incumbent spend). Three-vendor bake-off, 10-day decision window.",
    payment_terms: "annual_upfront",
    payment_terms_notes:
      "Customer requesting 90-day termination-for-convenience right and 2026-priced seat expansion lock through 2027.",
    pricing_model: "subscription",
    usage_commit_units: null,
    overage_rate: null,
    non_standard_clauses: nonStandard,
    ae_owner: "Priya Shankar",
    ae_manager: "Marcus Reilly",
    competitive_context: competitiveContext,
    customer_request: customerRequest,
    close_date: "2026-05-14",
    is_scenario: 1,
  },
  meta: {
    deal_id: "deal_tessera_2026_displacement",
    display_order: 3,
    is_recommended: 0,
    hero_tagline:
      "35% discount + 6 months free + waived implementation. Margin dies. Where's the bleed?",
    difficulty_label: "high",
    estimated_review_time_seconds: 70,
  },
};
