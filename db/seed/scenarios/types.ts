export type DealSeed = {
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
  payment_terms:
    | "net_30"
    | "net_60"
    | "annual_upfront"
    | "quarterly"
    | "custom";
  payment_terms_notes: string | null;
  pricing_model: "subscription" | "usage_based" | "hybrid" | "one_time";
  usage_commit_units: number | null;
  overage_rate: number | null;
  non_standard_clauses: string | null;
  ae_owner: string;
  ae_manager: string;
  competitive_context: string | null;
  customer_request: string;
  close_date: string | null;
  is_scenario: 0 | 1;
};

export type ScenarioMetaSeed = {
  deal_id: string;
  display_order: number;
  is_recommended: 0 | 1;
  hero_tagline: string;
  difficulty_label: "medium" | "high" | "expert";
  estimated_review_time_seconds: number;
};

export type ScenarioBundle = {
  deal: DealSeed;
  meta: ScenarioMetaSeed;
};
