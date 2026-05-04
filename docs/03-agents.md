# 03 — Agents

## The agent system

One **Orchestrator** + five specialized **Sub-agents**. Each sub-agent has:
- A single, well-defined responsibility
- A specific MCP tool set it's allowed to call
- A structured output contract (Zod schema + markdown summary)
- A prompt living in `lib/prompts/<agent>.md` (not hardcoded in TS)

The orchestrator is the only agent that talks to all sub-agents. Sub-agents do not call each other. This is intentional — keeps the dependency graph clean and the audit log easy to read.

---

## Orchestrator

**Role**: Receives a deal, decomposes the review into sub-agent tasks, dispatches in parallel where possible, then synthesizes a final review.

**Tools available**:
- `crm.get_deal(id)` — fetches deal + customer record
- `crm.get_pricing_guardrails()` — fetches active guardrails
- `crm.get_approval_matrix()` — fetches active matrix
- `vector_search.find_similar_deals(deal_id | text, k=3)` — fetches top-3 similar past deals
- `exa.customer_signals(domain, name)` — fetches public signals about the customer
- All sub-agents are exposed as callable tools to the orchestrator

**Execution plan** (the orchestrator's prompt instructs it to follow this exact sequence):

1. Fetch deal + customer record (CRM tool)
2. Fetch customer signals (Exa) — fire-and-forget, parallel with step 3
3. Fetch top-3 similar past deals (vector search) — parallel with step 2
4. Once deal + signals + similar deals are in hand, dispatch in parallel:
   - Pricing Agent (with deal + guardrails + similar deals as context)
   - ASC 606 Agent (with deal as context)
   - Redline Agent (with deal + customer signals as context)
5. Once Pricing, ASC 606, and Redline are complete, dispatch sequentially:
   - Approval Agent (needs all three prior outputs to determine routing)
   - Comms Agent (needs all four prior outputs to draft messages)
6. Synthesize a final review summary: a 4-sentence executive overview citing the most important finding from each agent.
7. Persist the full review to `deal_reviews` and `audit_log`.
8. Stream a final completion event with the review ID.

**Streaming contract**: At every step, the orchestrator emits an SSE event of shape:

```ts
type StreamEvent =
  | { type: "step_start"; step: string; agent: string | null; ts: number }
  | { type: "step_progress"; step: string; partial_output: any; ts: number }
  | { type: "step_complete"; step: string; output: any; ts: number }
  | { type: "synthesis"; summary: string; review_id: string; ts: number }
  | { type: "error"; step: string; message: string; ts: number };
```

The frontend's `<ReasoningStream>` component renders one card per step in a vertical timeline, updating in place as events arrive.

---

## Sub-agent 1: Pricing Agent

**Single responsibility**: Evaluate whether the proposed deal price respects pricing guardrails and produce a margin analysis.

**Inputs**:
- The full deal record
- Active pricing guardrails for the deal's customer segment
- Top-3 similar past deals (for context — what did we do last time?)

**Tools available**: `crm.get_list_price(product, segment)` (helper)

**Output contract** (Zod schema):

```ts
const PricingOutputSchema = z.object({
  list_price: z.number(),
  proposed_price: z.number(),
  effective_discount_pct: z.number(),
  margin_pct_estimate: z.number(),
  guardrail_evaluations: z.array(z.object({
    rule_name: z.string(),
    passed: z.boolean(),
    severity: z.enum(["info", "warn", "block_without_approval", "block_absolute"]),
    actual_value: z.number(),
    threshold_value: z.number(),
    explanation: z.string(),
  })),
  alternative_structures: z.array(z.object({
    label: z.string(),                // 'Trade discount for term length'
    description: z.string(),
    proposed_price: z.number(),
    effective_discount_pct: z.number(),
    expected_acv_impact: z.number(),
    margin_pct_estimate: z.number(),
    rationale: z.string(),
  })).min(2).max(3),
  ltv_estimate_under_usage_assumptions: z.number().nullable(),
  similar_deal_references: z.array(z.string()),  // deal IDs
  confidence: z.enum(["low", "medium", "high"]),
  reasoning_summary: z.string(),       // 2-4 sentences for the audit log
});
```

**Prompt (lib/prompts/pricing-agent.md)** — the prompt should:
- State the agent's persona ("You are the Pricing Analyst on Clay's deal desk team.")
- Include the full deal payload, guardrails, and similar deals
- Instruct it to compute margin assuming **40% gross margin at list price** (a reasonable SaaS assumption — disclaim this in the UI)
- Require 2–3 alternative structures, each materially different
- Output ONLY valid JSON matching the schema (followed by a separate `reasoning_summary` field for audit)

---

## Sub-agent 2: ASC 606 Agent

**Single responsibility**: Identify revenue recognition implications of the proposed deal under ASC 606. Flag treatment ambiguity, performance obligation issues, variable consideration, and contract modification scenarios.

**Inputs**:
- The full deal record (especially `ramp_schedule_json`, `non_standard_clauses`, `pricing_model`)

**Tools available**: None — this is a reasoning-only agent.

**Output contract**:

```ts
const Asc606OutputSchema = z.object({
  performance_obligations: z.array(z.object({
    name: z.string(),
    description: z.string(),
    is_distinct: z.boolean(),
    estimated_standalone_value: z.number().nullable(),
    expected_recognition_pattern: z.enum(["point_in_time", "ratable_over_term", "usage_based", "milestone"]),
    rationale: z.string(),
  })),
  variable_consideration_flags: z.array(z.object({
    source: z.string(),                // 'ramp', 'rollover_credits', 'usage_overage', 'mfn_true_up'
    treatment_required: z.string(),    // e.g., 'expected_value_method'
    estimation_difficulty: z.enum(["low", "medium", "high"]),
    explanation: z.string(),
  })),
  contract_modification_risk: z.object({
    is_at_risk: z.boolean(),
    explanation: z.string(),
  }),
  recognized_revenue_schedule: z.array(z.object({
    period: z.string(),                // 'Year 1', 'Year 2 Q1', etc.
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
});
```

**Prompt (lib/prompts/asc606-agent.md)** — the prompt should:
- State the persona ("You are a senior revenue accountant familiar with ASC 606 applied to usage-based SaaS contracts.")
- Provide the deal payload
- Force the model to enumerate performance obligations explicitly
- Require it to flag any non-standard clauses that affect rev rec (rollover, MFN, ramps, exclusivity)
- Output the expected revenue recognition schedule by period
- Include the standard disclaimer in `reasoning_summary` ("This is an automated estimate; final determination requires CFO/auditor review.")

---

## Sub-agent 3: Redline Agent

**Single responsibility**: Read the proposed contract structure, flag non-standard clauses, suggest specific counter-positions for each.

**Inputs**:
- The full deal record (especially `non_standard_clauses`, `payment_terms`, `customer_request`)
- Customer signals from Exa (to inform "is this customer in a position of strength or weakness?")

**Tools available**: None — reasoning-only.

**Output contract**:

```ts
const RedlineOutputSchema = z.object({
  flagged_clauses: z.array(z.object({
    clause_type: z.string(),           // 'MFN', 'rollover_credits', 'exclusivity', etc.
    customer_proposed_language: z.string(),
    risk_level: z.enum(["low", "medium", "high"]),
    risk_explanation: z.string(),
    suggested_counter: z.string(),
    fallback_position: z.string(),     // if customer rejects counter
    precedent_notes: z.string().nullable(),  // 'we accepted similar with Anthropic 2025 Q3'
  })),
  standard_clauses_affirmed: z.array(z.string()),  // 'data residency: standard', etc.
  overall_redline_priority: z.enum(["low", "medium", "high", "block"]),
  one_line_summary: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  reasoning_summary: z.string(),
});
```

**Prompt (lib/prompts/redline-agent.md)** — should:
- Persona: "You are Clay's contract redline specialist. You've reviewed thousands of order forms."
- Specific instructions on each common clause type (MFN, rollover, exclusivity, custom payment terms, professional services bundling)
- Force a counter for every flagged clause — never just "this is a problem" without a proposed fix
- Use the customer signals to inform position-of-strength reasoning

---

## Sub-agent 4: Approval Agent

**Single responsibility**: Apply the active approval matrix to the deal + the upstream agent outputs and determine the exact routing.

**Inputs**:
- The deal record
- The active approval matrix (rules, sorted by priority)
- Outputs from Pricing, ASC 606, and Redline agents
- The customer's segment

**Tools available**: None — pure rule application + reasoning.

**Output contract**:

```ts
const ApprovalOutputSchema = z.object({
  required_approvers: z.array(z.object({
    role: z.string(),                  // 'ae_manager', 'rev_ops', 'cfo', 'legal', 'ceo'
    rule_triggered: z.string(),        // which matrix rule fired
    rationale: z.string(),
  })),
  approval_chain: z.array(z.object({   // ordered chain of approvers
    step: z.number(),
    approver_role: z.string(),
    parallel_with: z.array(z.string()),  // other roles that approve in parallel at same step
    can_veto: z.boolean(),
  })),
  expected_cycle_time_business_days: z.number(),
  blockers_to_address_first: z.array(z.string()),  // things AE must clean up before submitting
  one_line_summary: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  reasoning_summary: z.string(),
});
```

**Prompt** — should explicitly walk through the matrix top-to-bottom, evaluate each rule against the deal, log which fired and which didn't.

---

## Sub-agent 5: Comms Agent

**Single responsibility**: Draft three pieces of communication for downstream stakeholders.

**Inputs**: All upstream agent outputs.

**Tools available**: None — generation-only.

**Output contract**:

```ts
const CommsOutputSchema = z.object({
  slack_post: z.object({
    channel_suggestion: z.string(),      // '#deal-desk'
    blocks: z.any(),                     // Slack Block Kit JSON
    plaintext_fallback: z.string(),
  }),
  ae_email_draft: z.object({
    to: z.string(),                       // ae owner
    subject: z.string(),
    body_markdown: z.string(),
    suggested_send_time: z.string(),     // e.g., 'within 4 business hours'
  }),
  customer_email_draft: z.object({
    to_role: z.string(),                  // 'procurement' | 'champion' | 'economic_buyer'
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
});
```

**Prompt** — should pull tone cues from the deal's competitive context and the customer's segment. Enterprise customers → more formal. PLG conversion customers → more collaborative.

---

## Why structured outputs

Every agent produces JSON conforming to a Zod schema. This matters because:

1. **The UI can render structured data well.** Bullets, tables, color-coded severity badges, expandable sections.
2. **The audit log is queryable.** "Show me all deals where Pricing flagged a guardrail block in the last week" becomes one SQL query.
3. **The eval harness has ground truth to compare against.** Without structure, there's no way to test agent quality.
4. **Streaming partial outputs is possible.** As fields populate, the UI updates field-by-field — that's the "watch reasoning unfold" UX.

The `reasoning_summary` field on every output exists so the orchestrator's final synthesis can quote each agent's TL;DR in 4 sentences.

## Model selection

- **Orchestrator**: `claude-opus-4-7` — needs the planning capability and tool-use chain reasoning
- **Pricing Agent**: `claude-sonnet-4-6` — math-heavy but bounded; Sonnet handles it
- **ASC 606 Agent**: `claude-opus-4-7` — accounting reasoning is the highest-stakes output; use the strongest model
- **Redline Agent**: `claude-sonnet-4-6` — pattern-match against known clause types
- **Approval Agent**: `claude-haiku-4-5` — pure rule application; Haiku is fast and cheap
- **Comms Agent**: `claude-sonnet-4-6` — tone-sensitive generation

This split costs <$0.50 per full review run and finishes in 45–75 seconds.

## Failure handling

- If any sub-agent fails (timeout, schema violation, API error), the orchestrator emits an `error` event for that step and continues with the others.
- The synthesis step explicitly notes any failed agents: *"Pricing analysis failed; review proceeded with ASC 606 and Redline only. Recommend manual pricing review."*
- A retry button next to the failed step in the UI re-runs that single sub-agent without re-running the full pipeline.

## Determinism for the demo

The 5 hero scenarios should produce **stable, predictable outputs**. To achieve this:
- Set `temperature: 0.2` for all agent calls
- Cache successful outputs for hero scenarios in `db/seed/cached_outputs/` and serve them instantly on first request, only re-running on cache miss or explicit refresh
- This makes the demo feel snappy and prevents an unlucky LLM run from torpedoing the HM's first impression

For visitor-submitted deals, run live every time — that's where the magic is.
