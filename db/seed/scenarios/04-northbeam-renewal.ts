import type { ScenarioBundle } from "./types";

// Hero Scenario 4 — Northbeam Mortgage renewal-at-risk with commit reduction.
// Highlights: Pricing + Comms agents, customer health score signal.

const customerRequest =
  "Northbeam used 60% of their committed credits. They're asking for: (1) 30% reduction to $280K base, (2) shift to usage-based for any overage above the new commit, (3) extension of payment terms from net-30 to net-60. CSM is panicking — Northbeam is a flagship logo in fintech. CSM proposed accepting all three. Their CRO will sign in two weeks; competitor (a recent Y Combinator startup with 60% lower pricing) has been pitching them aggressively.";

const competitiveContext =
  "Y Combinator-backed competitor pitching at ~60% below current Northbeam pricing. Customer health score is 42/100 driven by under-utilization (only 60% of commit consumed) and 3 of 5 paid features unadopted. Flagship fintech logo — strategic to retain.";

const nonStandard = JSON.stringify([
  "commit_reduction_30pct",
  "switch_to_usage_based_for_overage",
  "payment_terms_net_60",
]);

export const northbeamRenewal: ScenarioBundle = {
  deal: {
    id: "deal_northbeam_2026_renewal",
    customer_id: "cust_northbeam_mortgage",
    name: "FY26 Renewal — Commit Reduction Request",
    deal_type: "renewal",
    stage: "review",
    acv: 280_000,
    tcv: 280_000,
    term_months: 12,
    ramp_schedule_json: null,
    list_price: 400_000,
    proposed_price: 280_000,
    discount_pct: 30.0,
    discount_reason:
      "Renewal at-risk: under-utilization (60% commit consumed) + competitor undercut. CSM-proposed concession to retain flagship fintech logo.",
    payment_terms: "net_60",
    payment_terms_notes:
      "Customer requested extension from net-30 to net-60. Cash impact ~30 days; trade-off vs. retention.",
    pricing_model: "hybrid",
    usage_commit_units: null,
    overage_rate: 0.0008,
    non_standard_clauses: nonStandard,
    ae_owner: "Jamal Okafor",
    ae_manager: "Marcus Reilly",
    competitive_context: competitiveContext,
    customer_request: customerRequest,
    close_date: "2026-05-18",
    is_scenario: 1,
  },
  meta: {
    deal_id: "deal_northbeam_2026_renewal",
    display_order: 4,
    is_recommended: 0,
    hero_tagline:
      "$400K customer hit only 60% of commit. CSM wants to give them 30% off renewal. Should we?",
    difficulty_label: "high",
    estimated_review_time_seconds: 65,
  },
};
