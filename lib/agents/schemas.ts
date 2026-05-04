import { z } from "zod";

// Structured output contracts for the orchestrator's five sub-agents.
// Spec: docs/03-agents.md.
//
// Phase 3 only wires the Pricing Agent end-to-end. The other four schemas are
// defined here so Phase 4 (full orchestrator) can import them without churn.

const Severity = z.enum([
  "info",
  "warn",
  "block_without_approval",
  "block_absolute",
]);
const Confidence = z.enum(["low", "medium", "high"]);

// ---------- Pricing ----------

export const PricingOutputSchema = z.object({
  list_price: z.number(),
  proposed_price: z.number(),
  effective_discount_pct: z.number(),
  margin_pct_estimate: z.number(),
  guardrail_evaluations: z.array(
    z.object({
      rule_name: z.string(),
      passed: z.boolean(),
      severity: Severity,
      actual_value: z.number(),
      threshold_value: z.number(),
      explanation: z.string(),
    }),
  ),
  alternative_structures: z
    .array(
      z.object({
        label: z.string(),
        description: z.string(),
        proposed_price: z.number(),
        effective_discount_pct: z.number(),
        expected_acv_impact: z.number(),
        margin_pct_estimate: z.number(),
        rationale: z.string(),
      }),
    )
    .min(2)
    .max(3),
  ltv_estimate_under_usage_assumptions: z.number().nullable(),
  similar_deal_references: z.array(z.string()),
  confidence: Confidence,
  reasoning_summary: z.string(),
});
export type PricingOutput = z.infer<typeof PricingOutputSchema>;

// ---------- ASC 606 ----------

export const Asc606OutputSchema = z.object({
  performance_obligations: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      is_distinct: z.boolean(),
      estimated_standalone_value: z.number().nullable(),
      expected_recognition_pattern: z.enum([
        "point_in_time",
        "ratable_over_term",
        "usage_based",
        "milestone",
      ]),
      rationale: z.string(),
    }),
  ),
  variable_consideration_flags: z.array(
    z.object({
      source: z.string(),
      treatment_required: z.string(),
      estimation_difficulty: z.enum(["low", "medium", "high"]),
      explanation: z.string(),
    }),
  ),
  contract_modification_risk: z.object({
    is_at_risk: z.boolean(),
    explanation: z.string(),
  }),
  recognized_revenue_schedule: z.array(
    z.object({
      period: z.string(),
      amount: z.number(),
      notes: z.string().nullable(),
    }),
  ),
  red_flags: z.array(
    z.object({
      severity: z.enum(["info", "warn", "block_without_approval"]),
      label: z.string(),
      explanation: z.string(),
    }),
  ),
  confidence: Confidence,
  reasoning_summary: z.string(),
});
export type Asc606Output = z.infer<typeof Asc606OutputSchema>;

// ---------- Redline ----------

export const RedlineOutputSchema = z.object({
  flagged_clauses: z.array(
    z.object({
      clause_type: z.string(),
      customer_proposed_language: z.string(),
      risk_level: z.enum(["low", "medium", "high"]),
      risk_explanation: z.string(),
      suggested_counter: z.string(),
      fallback_position: z.string(),
      precedent_notes: z.string().nullable(),
    }),
  ),
  standard_clauses_affirmed: z.array(z.string()),
  overall_redline_priority: z.enum(["low", "medium", "high", "block"]),
  one_line_summary: z.string(),
  confidence: Confidence,
  reasoning_summary: z.string(),
});
export type RedlineOutput = z.infer<typeof RedlineOutputSchema>;

// ---------- Approval ----------

export const ApprovalOutputSchema = z.object({
  required_approvers: z.array(
    z.object({
      role: z.string(),
      rule_triggered: z.string(),
      rationale: z.string(),
    }),
  ),
  approval_chain: z.array(
    z.object({
      step: z.number(),
      approver_role: z.string(),
      parallel_with: z.array(z.string()),
      can_veto: z.boolean(),
    }),
  ),
  expected_cycle_time_business_days: z.number(),
  blockers_to_address_first: z.array(z.string()),
  one_line_summary: z.string(),
  confidence: Confidence,
  reasoning_summary: z.string(),
});
export type ApprovalOutput = z.infer<typeof ApprovalOutputSchema>;

// ---------- Comms ----------

export const CommsOutputSchema = z.object({
  slack_post: z.object({
    channel_suggestion: z.string(),
    blocks: z.unknown(),
    plaintext_fallback: z.string(),
  }),
  ae_email_draft: z.object({
    to: z.string(),
    subject: z.string(),
    body_markdown: z.string(),
    suggested_send_time: z.string(),
  }),
  customer_email_draft: z.object({
    to_role: z.string(),
    subject: z.string(),
    body_markdown: z.string(),
    tone: z.enum(["collaborative", "firm", "warm", "urgent"]),
    counter_positions_included: z.array(z.string()),
  }),
  approval_review_one_pager: z.object({
    title: z.string(),
    sections: z.array(
      z.object({
        heading: z.string(),
        content_markdown: z.string(),
      }),
    ),
  }),
  reasoning_summary: z.string(),
});
export type CommsOutput = z.infer<typeof CommsOutputSchema>;
