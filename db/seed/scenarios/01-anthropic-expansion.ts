import type { ScenarioBundle } from "./types";

// Hero Scenario 1 — Anthropic strategic enterprise expansion (MFN clause).
// Highlights: Redline + Approval agents.
// All customer-facing text is copied verbatim from docs/04-scenarios.md.

const customerRequest =
  "Anthropic wants to consolidate from 6 disparate workspaces into a single enterprise contract. They're asking for: (1) MFN clause guaranteeing they get any pricing improvement we offer to peer AI labs over the next 24 months, (2) custom data provider credits (pre-paid, $200K of the TCV applied as credits redeemable against any of our enrichment partners), (3) a 6-month onboarding ramp where they pay 50% from months 1–6 then full price from month 7 onward, (4) annual billing in arrears (not standard for us), (5) a 60-day termination-for-convenience right starting month 13. AE is pushing hard — they've already verbally committed to 'we can probably do MFN with carve-outs.' Procurement is signing in Q1, deadline-driven.";

const competitiveContext =
  "Anthropic is also evaluating in-house tooling — they have engineering bandwidth to build alternatives if pricing isn't competitive. We have a strong relationship with their RevOps lead but Procurement is new and asking aggressive questions.";

const nonStandard = JSON.stringify([
  "MFN_24mo_with_carveout_intent",
  "custom_data_provider_credits_200k",
  "ramp_50pct_6mo",
  "annual_billing_in_arrears",
  "termination_for_convenience_60d_starting_m13",
]);

// 50% of full price for months 1-6 (i.e., $250K annualized = ~$20.83K/mo),
// then full price (~$41.67K/mo) from month 7 onward.
const rampSchedule = JSON.stringify([
  { month: 1, amount: 20833 },
  { month: 2, amount: 20833 },
  { month: 3, amount: 20833 },
  { month: 4, amount: 20833 },
  { month: 5, amount: 20833 },
  { month: 6, amount: 20833 },
  { month: 7, amount: 41667 },
  { month: 8, amount: 41667 },
  { month: 9, amount: 41667 },
  { month: 10, amount: 41667 },
  { month: 11, amount: 41667 },
  { month: 12, amount: 41667 },
]);

export const anthropicExpansion: ScenarioBundle = {
  deal: {
    id: "deal_anthropic_2026q1_expansion",
    customer_id: "cust_anthropic",
    name: "2026 Multi-Year Enterprise Consolidation",
    deal_type: "expansion",
    stage: "review",
    acv: 500_000,
    tcv: 1_500_000,
    term_months: 36,
    ramp_schedule_json: rampSchedule,
    list_price: 588_235,
    proposed_price: 500_000,
    discount_pct: 15.0,
    discount_reason:
      "Multi-year volume commit (3yr / $1.5M TCV) and strategic AI lab logo. Anchored at 15% off list before MFN and credits considerations.",
    payment_terms: "custom",
    payment_terms_notes:
      "Customer requested annual billing in arrears — not standard. Procurement deadline-driven.",
    pricing_model: "hybrid",
    usage_commit_units: null,
    overage_rate: null,
    non_standard_clauses: nonStandard,
    ae_owner: "Maya Chen",
    ae_manager: "Sarah Goldstein",
    competitive_context: competitiveContext,
    customer_request: customerRequest,
    close_date: "2026-05-25",
    is_scenario: 1,
  },
  meta: {
    deal_id: "deal_anthropic_2026q1_expansion",
    display_order: 1,
    is_recommended: 1,
    hero_tagline:
      "$1.5M committed expansion with an MFN clause and a 6-month onboarding ramp",
    difficulty_label: "high",
    estimated_review_time_seconds: 75,
  },
};
