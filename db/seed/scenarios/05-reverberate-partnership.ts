import type { ScenarioBundle } from "./types";

// Hero Scenario 5 — Reverberate Growth white-label partnership.
// Highlights: Approval agent (non-standard escalation path).

const customerRequest =
  "Reverberate is a top-50 GTM agency that uses Clay heavily for client engagements. They've proposed a strategic partnership: (1) white-label Clay tables and waterfalls under their own product 'Reverberate Engine', (2) 25% rev share on all Reverberate Engine subscriptions paid by their clients (estimated $400K–$1.2M annual contribution to Clay), (3) co-marketing rights including case studies with their clients, (4) early access to new Clay features 30 days before public launch. Reverberate's founder is well-connected in the GTM ops community and has 8 of our top-50 customers as their clients. AE doesn't have authority over partnership deals; routed to us by RevOps.";

const competitiveContext =
  "Reverberate has been a heavy individual user; they could in theory rebuild parts of Clay's core in-house but the time-to-value cost would gate their consulting growth. Founder is well-connected — partnership effectively converts a rebuild risk into distribution leverage with 8 top-50 customers in their book.";

const nonStandard = JSON.stringify([
  "white_label_branding",
  "rev_share_25pct",
  "co_marketing_with_client_attribution",
  "early_access_30d_advance",
]);

export const reverberatePartnership: ScenarioBundle = {
  deal: {
    id: "deal_reverberate_2026_partnership",
    customer_id: "cust_reverberate_growth",
    name: "Reverberate Engine White-Label Partnership",
    deal_type: "partnership",
    stage: "review",
    acv: 0,
    tcv: 0,
    term_months: 24,
    ramp_schedule_json: null,
    list_price: 0,
    proposed_price: 0,
    discount_pct: 0.0,
    discount_reason:
      "Not a priced contract — value is rev share. Estimated $400K–$1.2M/yr from white-labeled Reverberate Engine subscriptions.",
    payment_terms: "custom",
    payment_terms_notes:
      "Quarterly rev-share remittance from Reverberate to Clay; net-45 from end-of-quarter close. No baseline subscription fee.",
    pricing_model: "one_time",
    usage_commit_units: null,
    overage_rate: null,
    non_standard_clauses: nonStandard,
    ae_owner: "Devon Wright",
    ae_manager: "Sarah Goldstein",
    competitive_context: competitiveContext,
    customer_request: customerRequest,
    close_date: "2026-06-01",
    is_scenario: 1,
  },
  meta: {
    deal_id: "deal_reverberate_2026_partnership",
    display_order: 5,
    is_recommended: 0,
    hero_tagline:
      "Top-50 GTM agency wants to white-label Clay for client work. Standard approval matrix doesn't apply.",
    difficulty_label: "expert",
    estimated_review_time_seconds: 75,
  },
};
