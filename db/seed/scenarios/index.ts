import type { DB } from "@/lib/db/client";
import { anthropicExpansion } from "./01-anthropic-expansion";
import { notionConversion } from "./02-notion-conversion";
import { tesseraDisplacement } from "./03-tessera-displacement";
import { northbeamRenewal } from "./04-northbeam-renewal";
import { reverberatePartnership } from "./05-reverberate-partnership";
import type { ScenarioBundle } from "./types";

export const scenarios: ScenarioBundle[] = [
  anthropicExpansion,
  notionConversion,
  tesseraDisplacement,
  northbeamRenewal,
  reverberatePartnership,
];

const insertDealSql = `
  INSERT OR REPLACE INTO deals (
    id, customer_id, name, deal_type, stage, acv, tcv, term_months,
    ramp_schedule_json, list_price, proposed_price, discount_pct,
    discount_reason, payment_terms, payment_terms_notes, pricing_model,
    usage_commit_units, overage_rate, non_standard_clauses, ae_owner,
    ae_manager, competitive_context, customer_request, close_date,
    is_scenario
  ) VALUES (
    @id, @customer_id, @name, @deal_type, @stage, @acv, @tcv, @term_months,
    @ramp_schedule_json, @list_price, @proposed_price, @discount_pct,
    @discount_reason, @payment_terms, @payment_terms_notes, @pricing_model,
    @usage_commit_units, @overage_rate, @non_standard_clauses, @ae_owner,
    @ae_manager, @competitive_context, @customer_request, @close_date,
    @is_scenario
  )
`;

const insertMetaSql = `
  INSERT OR REPLACE INTO scenario_metadata (
    deal_id, display_order, is_recommended, hero_tagline,
    difficulty_label, estimated_review_time_seconds
  ) VALUES (
    @deal_id, @display_order, @is_recommended, @hero_tagline,
    @difficulty_label, @estimated_review_time_seconds
  )
`;

export function seedScenarios(db: DB): number {
  const insertDeal = db.prepare(insertDealSql);
  const insertMeta = db.prepare(insertMetaSql);
  const tx = db.transaction((bundles: ScenarioBundle[]) => {
    for (const b of bundles) {
      insertDeal.run(b.deal);
      insertMeta.run(b.meta);
    }
  });
  tx(scenarios);
  return scenarios.length;
}
