import type { DB } from "@/lib/db/client";

type GuardrailSeed = {
  id: string;
  rule_name: string;
  applies_to_segment: "enterprise" | "mid_market" | "plg_self_serve" | null;
  metric: "discount_pct" | "margin_pct" | "ramp_length_months";
  operator: "<=" | ">=" | "==";
  threshold_value: number;
  severity: "warn" | "block_without_approval" | "block_absolute";
  notes: string | null;
};

export const guardrails: GuardrailSeed[] = [
  {
    id: "gr_ent_discount_warn",
    rule_name: "Enterprise discount soft ceiling",
    applies_to_segment: "enterprise",
    metric: "discount_pct",
    operator: "<=",
    threshold_value: 25,
    severity: "warn",
    notes:
      "Discounts up to 25% are within standard enterprise envelope. Document justification.",
  },
  {
    id: "gr_ent_discount_approval",
    rule_name: "Enterprise discount requires CFO sign-off",
    applies_to_segment: "enterprise",
    metric: "discount_pct",
    operator: "<=",
    threshold_value: 35,
    severity: "block_without_approval",
    notes:
      "Discounts in 25–35% band require CFO approval; document the strategic rationale.",
  },
  {
    id: "gr_ent_discount_absolute",
    rule_name: "Enterprise discount hard ceiling",
    applies_to_segment: "enterprise",
    metric: "discount_pct",
    operator: "<=",
    threshold_value: 50,
    severity: "block_absolute",
    notes:
      "Anything beyond 50% off list is structurally out of bounds; rebuild the deal shape rather than approve.",
  },
  {
    id: "gr_mm_discount_warn",
    rule_name: "Mid-market discount soft ceiling",
    applies_to_segment: "mid_market",
    metric: "discount_pct",
    operator: "<=",
    threshold_value: 20,
    severity: "warn",
    notes: "Mid-market envelope is tighter than enterprise.",
  },
  {
    id: "gr_mm_discount_approval",
    rule_name: "Mid-market discount requires Finance sign-off",
    applies_to_segment: "mid_market",
    metric: "discount_pct",
    operator: "<=",
    threshold_value: 30,
    severity: "block_without_approval",
    notes: "Mid-market 20–30% requires Finance approval.",
  },
  {
    id: "gr_plg_discount_warn",
    rule_name: "PLG/self-serve discount soft ceiling",
    applies_to_segment: "plg_self_serve",
    metric: "discount_pct",
    operator: "<=",
    threshold_value: 15,
    severity: "warn",
    notes: "Self-serve discounts above 15% need RevOps eyes.",
  },
  {
    id: "gr_plg_discount_approval",
    rule_name: "PLG/self-serve discount requires RevOps sign-off",
    applies_to_segment: "plg_self_serve",
    metric: "discount_pct",
    operator: "<=",
    threshold_value: 25,
    severity: "block_without_approval",
    notes: "Self-serve 15–25% discounts gate behind RevOps.",
  },
  {
    id: "gr_all_margin_floor_warn",
    rule_name: "Gross margin floor (warn)",
    applies_to_segment: null,
    metric: "margin_pct",
    operator: ">=",
    threshold_value: 40,
    severity: "warn",
    notes:
      "Effective margin below 40% is a yellow flag — rerun the math after concessions.",
  },
  {
    id: "gr_all_margin_floor_absolute",
    rule_name: "Gross margin absolute floor",
    applies_to_segment: null,
    metric: "margin_pct",
    operator: ">=",
    threshold_value: 25,
    severity: "block_absolute",
    notes:
      "Effective margin under 25% is structurally non-viable; reshape concessions before re-quoting.",
  },
  {
    id: "gr_ent_ramp_warn",
    rule_name: "Enterprise ramp length soft ceiling",
    applies_to_segment: "enterprise",
    metric: "ramp_length_months",
    operator: "<=",
    threshold_value: 6,
    severity: "warn",
    notes: "Ramps over 6 months distort effective discount calculations.",
  },
  {
    id: "gr_mm_ramp_approval",
    rule_name: "Mid-market ramp length requires sign-off",
    applies_to_segment: "mid_market",
    metric: "ramp_length_months",
    operator: "<=",
    threshold_value: 3,
    severity: "block_without_approval",
    notes:
      "Mid-market ramps over 3 months hide discount and complicate ASC 606 — Finance approval required.",
  },
];

export function seedGuardrails(db: DB): number {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO pricing_guardrails (
      id, rule_name, applies_to_segment, metric, operator,
      threshold_value, severity, notes
    ) VALUES (
      @id, @rule_name, @applies_to_segment, @metric, @operator,
      @threshold_value, @severity, @notes
    )
  `);
  const tx = db.transaction((rows: GuardrailSeed[]) => {
    for (const row of rows) insert.run(row);
  });
  tx(guardrails);
  return guardrails.length;
}
