"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// Tabbed Zod schema viewer. Each tab shows the agent's input shape,
// output schema, and a truncated example output.

type TabKey = "pricing" | "asc606" | "redline" | "approval" | "comms";

type TabSpec = {
  key: TabKey;
  label: string;
  schemaSource: string;
  exampleOutput: string;
};

const TABS: TabSpec[] = [
  {
    key: "pricing",
    label: "Pricing",
    schemaSource: `// lib/agents/schemas.ts
export const PricingOutputSchema = z.object({
  list_price: z.number(),
  proposed_price: z.number(),
  effective_discount_pct: z.number(),     // real discount after ramp + free months
  margin_pct_estimate: z.number(),         // assumes 40% gross margin at list
  guardrail_evaluations: z.array(z.object({
    rule_name: z.string(),
    passed: z.boolean(),
    severity: z.enum(["info", "warn",
                      "block_without_approval", "block_absolute"]),
    actual_value: z.number(),
    threshold_value: z.number(),
    explanation: z.string(),
  })),
  alternative_structures: z.array(z.object({
    label: z.string(),                     // "Trade discount for term length"
    description: z.string(),
    proposed_price: z.number(),
    effective_discount_pct: z.number(),
    expected_acv_impact: z.number(),
    margin_pct_estimate: z.number(),
    rationale: z.string(),
  })).min(2).max(3),
  ltv_estimate_under_usage_assumptions: z.number().nullable(),
  similar_deal_references: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  reasoning_summary: z.string(),
});`,
    exampleOutput: `{
  "list_price": 1800000,
  "proposed_price": 1530000,
  "effective_discount_pct": 28.4,
  "margin_pct_estimate": 22.1,
  "guardrail_evaluations": [
    { "rule_name": "max_discount_enterprise",
      "passed": false, "severity": "block_without_approval",
      "actual_value": 28.4, "threshold_value": 20,
      "explanation": "Effective discount exceeds 20% threshold once ramp + credits factored in." }
  ],
  "alternative_structures": [
    { "label": "Trade discount for 48-month term",
      "proposed_price": 1620000, "effective_discount_pct": 18.0,
      "rationale": "12 extra months reduce CAC payback to 14 months." },
    /* …2 more */
  ],
  "confidence": "high",
  "reasoning_summary": "Headline 15% becomes 28.4% effective…"
}`,
  },
  {
    key: "asc606",
    label: "ASC 606",
    schemaSource: `export const Asc606OutputSchema = z.object({
  performance_obligations: z.array(z.object({
    name: z.string(),
    is_distinct: z.boolean(),
    estimated_standalone_value: z.number().nullable(),
    expected_recognition_pattern: z.enum([
      "point_in_time", "ratable_over_term",
      "usage_based", "milestone",
    ]),
    rationale: z.string(),
  })),
  variable_consideration_flags: z.array(z.object({
    source: z.string(),
    treatment_required: z.string(),
    estimation_difficulty: z.enum(["low", "medium", "high"]),
    explanation: z.string(),
  })),
  contract_modification_risk: z.object({
    is_at_risk: z.boolean(),
    explanation: z.string(),
  }),
  recognized_revenue_schedule: z.array(z.object({
    period: z.string(),
    amount: z.number(),
    notes: z.string().nullable(),
  })),
  red_flags: z.array(z.object({
    severity: z.enum(["info", "warn", "block_without_approval"]),
    label: z.string(),
    explanation: z.string(),
  })),
  confidence: z.enum(["low", "medium", "high"]),
  reasoning_summary: z.string(),
});`,
    exampleOutput: `{
  "performance_obligations": [
    { "name": "Platform access",
      "is_distinct": true,
      "expected_recognition_pattern": "ratable_over_term" },
    { "name": "Implementation services",
      "is_distinct": true,
      "expected_recognition_pattern": "milestone" }
  ],
  "variable_consideration_flags": [
    { "source": "Volume-based ramp",
      "treatment_required": "expected-value method",
      "estimation_difficulty": "medium" }
  ],
  "contract_modification_risk": {
    "is_at_risk": true,
    "explanation": "MFN clause may trigger contract modification on future event."
  },
  "recognized_revenue_schedule": [/* 36 monthly entries */],
  "confidence": "high"
}`,
  },
  {
    key: "redline",
    label: "Redline",
    schemaSource: `export const RedlineOutputSchema = z.object({
  flagged_clauses: z.array(z.object({
    clause_type: z.string(),
    customer_proposed_language: z.string(),
    risk_level: z.enum(["low", "medium", "high"]),
    risk_explanation: z.string(),
    suggested_counter: z.string(),
    fallback_position: z.string(),
    precedent_notes: z.string().nullable(),
  })),
  standard_clauses_affirmed: z.array(z.string()),
  overall_redline_priority: z.enum(["low", "medium", "high", "block"]),
  one_line_summary: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  reasoning_summary: z.string(),
});`,
    exampleOutput: `{
  "flagged_clauses": [
    { "clause_type": "MFN",
      "risk_level": "high",
      "suggested_counter": "MFN with 12-month carve-out + price floor protection.",
      "fallback_position": "Quarterly review against benchmark customers, no automatic adjustment." },
    { "clause_type": "Termination for convenience",
      "risk_level": "medium",
      "suggested_counter": "Permit only after month 18, with 90-day notice + clawback of unamortized credits." }
  ],
  "overall_redline_priority": "high",
  "one_line_summary": "5 non-standard clauses; MFN is the load-bearing one."
}`,
  },
  {
    key: "approval",
    label: "Approval",
    schemaSource: `export const ApprovalOutputSchema = z.object({
  required_approvers: z.array(z.object({
    role: z.string(),
    rule_triggered: z.string(),
    rationale: z.string(),
  })),
  approval_chain: z.array(z.object({
    step: z.number(),
    approver_role: z.string(),
    parallel_with: z.array(z.string()),
    can_veto: z.boolean(),
  })),
  expected_cycle_time_business_days: z.number(),
  blockers_to_address_first: z.array(z.string()),
  one_line_summary: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  reasoning_summary: z.string(),
});`,
    exampleOutput: `{
  "required_approvers": [
    { "role": "CFO", "rule_triggered": "ACV > $500K" },
    { "role": "Legal", "rule_triggered": "non-standard clause count > 3" },
    { "role": "CEO",  "rule_triggered": "MFN clause present" }
  ],
  "approval_chain": [
    { "step": 1, "approver_role": "AE Manager", "parallel_with": [], "can_veto": false },
    { "step": 2, "approver_role": "RevOps",     "parallel_with": [], "can_veto": false },
    { "step": 3, "approver_role": "CFO",        "parallel_with": ["Legal"], "can_veto": true },
    { "step": 4, "approver_role": "CEO",        "parallel_with": [], "can_veto": true }
  ],
  "expected_cycle_time_business_days": 5,
  "one_line_summary": "CFO + Legal in parallel, CEO sign-off final."
}`,
  },
  {
    key: "comms",
    label: "Comms",
    schemaSource: `export const CommsOutputSchema = z.object({
  slack_post: z.object({
    channel_suggestion: z.string(),
    blocks: z.unknown(),                    // Slack Block Kit
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
    sections: z.array(z.object({
      heading: z.string(),
      content_markdown: z.string(),
    })),
  }),
  reasoning_summary: z.string(),
});`,
    exampleOutput: `{
  "slack_post": {
    "channel_suggestion": "#deal-desk",
    "plaintext_fallback": "Anthropic Q1 expansion · $1.5M TCV · CFO+Legal+CEO required · 5d ETA"
  },
  "ae_email_draft": {
    "to": "ae@kiln-demo",
    "subject": "Anthropic expansion — desk review (action required)",
    "tone": "collaborative",
    "body_markdown": "Hi — desk review back. Three things to address before next call…"
  },
  "customer_email_draft": {
    "to_role": "Procurement Lead",
    "tone": "collaborative",
    "counter_positions_included": ["MFN carve-out", "Term length swap"]
  }
}`,
  },
];

export function SchemaTabs() {
  const [active, setActive] = useState<TabKey>("pricing");
  const tab = TABS.find((t) => t.key === active)!;

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <div
        role="tablist"
        aria-label="Agent output schemas"
        className="flex gap-0.5 border-b border-border bg-surface-secondary px-2 py-1.5 overflow-x-auto"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={active === t.key}
            onClick={() => setActive(t.key)}
            className={cn(
              "shrink-0 rounded px-2.5 py-1 text-[12px] font-medium transition",
              active === t.key
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 p-3 md:grid-cols-2">
        <div>
          <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
            Output schema
          </div>
          <pre className="overflow-x-auto rounded border border-border bg-surface-secondary p-2.5 font-mono text-[11px] leading-relaxed text-foreground">
            {tab.schemaSource}
          </pre>
        </div>
        <div>
          <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
            Example output (truncated)
          </div>
          <pre className="overflow-x-auto rounded border border-border bg-surface-secondary p-2.5 font-mono text-[11px] leading-relaxed text-foreground">
            {tab.exampleOutput}
          </pre>
        </div>
      </div>
    </div>
  );
}
