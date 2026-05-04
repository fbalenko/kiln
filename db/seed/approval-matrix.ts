import type { DB } from "@/lib/db/client";

type MatrixRuleSeed = {
  id: string;
  rule_name: string;
  condition_json: string;
  required_approver_role:
    | "ae_manager"
    | "rev_ops"
    | "finance"
    | "cfo"
    | "legal"
    | "ceo";
  rule_priority: number;
  is_default: 0 | 1;
  notes: string | null;
};

export const matrix: MatrixRuleSeed[] = [
  {
    id: "matrix_partnership_to_ceo",
    rule_name: "Partnership / rev-share routes to CEO",
    condition_json: JSON.stringify({ deal_type: { "=": "partnership" } }),
    required_approver_role: "ceo",
    rule_priority: 10,
    is_default: 1,
    notes:
      "Partnership deals fall outside the standard pricing matrix; CEO + Strategic Partnership Review own approval.",
  },
  {
    id: "matrix_tcv_over_1m_cfo",
    rule_name: "TCV over $1M requires CFO",
    condition_json: JSON.stringify({ tcv: { ">": 1_000_000 } }),
    required_approver_role: "cfo",
    rule_priority: 20,
    is_default: 1,
    notes: "Multi-million-dollar TCV always touches the CFO.",
  },
  {
    id: "matrix_mfn_to_legal",
    rule_name: "MFN clause requires Legal",
    condition_json: JSON.stringify({
      non_standard_clauses: { contains: "MFN" },
    }),
    required_approver_role: "legal",
    rule_priority: 30,
    is_default: 1,
    notes:
      "Most-Favored-Nation clauses change the pricing model going forward; Legal must scope carve-outs.",
  },
  {
    id: "matrix_compliance_clause_to_legal",
    rule_name: "Data residency / compliance addenda require Legal",
    condition_json: JSON.stringify({
      non_standard_clauses: {
        contains_any: [
          "data_residency",
          "phi_handling",
          "regulatory_audit",
          "fedramp",
          "ofac",
          "baa",
        ],
      },
    }),
    required_approver_role: "legal",
    rule_priority: 35,
    is_default: 1,
    notes: "Any compliance/regulatory clause routes through Legal review.",
  },
  {
    id: "matrix_discount_over_25_cfo",
    rule_name: "Discount over 25% routes to CFO",
    condition_json: JSON.stringify({ discount_pct: { ">": 25 } }),
    required_approver_role: "cfo",
    rule_priority: 50,
    is_default: 1,
    notes:
      "Headline discount above 25% (effective discount may be higher post-ramp/credits).",
  },
  {
    id: "matrix_payment_terms_finance",
    rule_name: "Non-standard payment terms route to Finance",
    condition_json: JSON.stringify({
      non_standard_clauses: {
        contains_any: [
          "deferred_billing",
          "payment_terms_net_60",
          "annual_billing_in_arrears",
        ],
      },
    }),
    required_approver_role: "finance",
    rule_priority: 60,
    is_default: 1,
    notes:
      "Anything that shifts cash timing or recognition cadence touches Finance.",
  },
  {
    id: "matrix_acv_100k_to_500k_revops",
    rule_name: "ACV $100K–$500K requires RevOps",
    condition_json: JSON.stringify({
      acv: { ">": 100_000, "<=": 500_000 },
    }),
    required_approver_role: "rev_ops",
    rule_priority: 80,
    is_default: 1,
    notes: "Mid-tier deals get a RevOps eye for structure consistency.",
  },
  {
    id: "matrix_default_ae_manager",
    rule_name: "Standard sub-$100K with ≤15% discount → AE Manager",
    condition_json: JSON.stringify({
      acv: { "<=": 100_000 },
      discount_pct: { "<=": 15 },
    }),
    required_approver_role: "ae_manager",
    rule_priority: 100,
    is_default: 1,
    notes: "Floor case — only AE Manager required.",
  },
];

export function seedApprovalMatrix(db: DB): number {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO approval_matrix (
      id, rule_name, condition_json, required_approver_role,
      rule_priority, is_default, notes
    ) VALUES (
      @id, @rule_name, @condition_json, @required_approver_role,
      @rule_priority, @is_default, @notes
    )
  `);
  const tx = db.transaction((rows: MatrixRuleSeed[]) => {
    for (const row of rows) insert.run(row);
  });
  tx(matrix);
  return matrix.length;
}
