import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  getApprovalMatrix,
  getDealById,
  getPricingGuardrails,
  type ApprovalMatrixRule,
  type DealWithCustomer,
  type PricingGuardrail,
} from "@/lib/db/queries";

// In-process MCP server backing the deal-desk agents.
//
// Phase 3 wires the Pricing Agent to this server but feeds the deal payload
// inline via the user message — the tools are registered, not called. Phase 4
// flips that: the orchestrator will call get_deal / get_pricing_guardrails
// over MCP to gather context, then dispatch the sub-agents.
//
// The handlers are real (not mocks) so Phase 4's wiring is purely additive.

const getDealTool = tool(
  "get_deal",
  "Fetch the full CRM record for a deal by ID, including the joined customer profile and (if applicable) hero-scenario metadata. Returns null if the deal does not exist.",
  { deal_id: z.string().describe("The deal ID, e.g. 'deal_anthropic_2026q1_expansion'") },
  async ({ deal_id }) => {
    const deal = getDealById(deal_id);
    if (!deal) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "deal_not_found", deal_id }),
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(serializeDeal(deal)),
        },
      ],
    };
  },
);

const getPricingGuardrailsTool = tool(
  "get_pricing_guardrails",
  "Fetch active pricing guardrails. If `segment` is provided, returns guardrails scoped to that segment plus universal (segment-less) guardrails. Otherwise returns the full set.",
  {
    segment: z
      .enum(["enterprise", "mid_market", "plg_self_serve"])
      .optional()
      .describe("Customer segment to scope the guardrail set to."),
  },
  async ({ segment }) => {
    const all = getPricingGuardrails();
    const filtered = segment
      ? all.filter(
          (g) => !g.applies_to_segment || g.applies_to_segment === segment,
        )
      : all;
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(filtered.map(serializeGuardrail)),
        },
      ],
    };
  },
);

const getDealWithCustomerTool = tool(
  "get_deal_with_customer",
  "Same as get_deal but the response is explicitly the joined deal+customer record. Useful when an upstream agent (e.g. the orchestrator) wants to pass a single payload to all downstream sub-agents.",
  { deal_id: z.string().describe("The deal ID to fetch.") },
  async ({ deal_id }) => {
    const deal = getDealById(deal_id);
    if (!deal) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "deal_not_found", deal_id }),
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(serializeDeal(deal)) },
      ],
    };
  },
);

const getApprovalMatrixTool = tool(
  "get_approval_matrix",
  "Fetch the active approval matrix — the ordered list of rules the Approval Agent walks top-to-bottom to determine routing for a deal.",
  {},
  async () => {
    const rules = getApprovalMatrix();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(rules.map(serializeMatrixRule)),
        },
      ],
    };
  },
);

export const crmMcpServer = createSdkMcpServer({
  name: "crm",
  version: "0.2.0",
  tools: [
    getDealTool,
    getDealWithCustomerTool,
    getPricingGuardrailsTool,
    getApprovalMatrixTool,
  ],
});

// The fully-qualified tool names the Agent SDK exposes to the model.
// Format: `mcp__<server-name>__<tool-name>`. Pass these in `allowedTools`
// to auto-approve calls without permission prompts.
export const CRM_TOOL_NAMES = [
  "mcp__crm__get_deal",
  "mcp__crm__get_deal_with_customer",
  "mcp__crm__get_pricing_guardrails",
  "mcp__crm__get_approval_matrix",
] as const;

function serializeDeal(d: DealWithCustomer) {
  return {
    id: d.id,
    name: d.name,
    deal_type: d.deal_type,
    stage: d.stage,
    acv: d.acv,
    tcv: d.tcv,
    term_months: d.term_months,
    ramp_schedule_json: d.ramp_schedule_json,
    list_price: d.list_price,
    proposed_price: d.proposed_price,
    discount_pct: d.discount_pct,
    discount_reason: d.discount_reason,
    payment_terms: d.payment_terms,
    payment_terms_notes: d.payment_terms_notes,
    pricing_model: d.pricing_model,
    usage_commit_units: d.usage_commit_units,
    overage_rate: d.overage_rate,
    non_standard_clauses: d.non_standard_clauses,
    ae_owner: d.ae_owner,
    ae_manager: d.ae_manager,
    competitive_context: d.competitive_context,
    customer_request: d.customer_request,
    close_date: d.close_date,
    customer: {
      id: d.customer.id,
      name: d.customer.name,
      domain: d.customer.domain,
      segment: d.customer.segment,
      employee_count: d.customer.employee_count,
      industry: d.customer.industry,
      hq_country: d.customer.hq_country,
      funding_stage: d.customer.funding_stage,
      arr_estimate: d.customer.arr_estimate,
      health_score: d.customer.health_score,
    },
  };
}

function serializeMatrixRule(r: ApprovalMatrixRule) {
  // Surface condition_json as parsed JSON so the agent doesn't have to
  // double-parse a string. Falls back to the raw string if it's malformed.
  let condition: unknown = r.condition_json;
  try {
    condition = JSON.parse(r.condition_json);
  } catch {
    /* keep as string */
  }
  return {
    id: r.id,
    rule_name: r.rule_name,
    rule_priority: r.rule_priority,
    required_approver_role: r.required_approver_role,
    is_default: r.is_default === 1,
    condition,
    notes: r.notes,
  };
}

function serializeGuardrail(g: PricingGuardrail) {
  return {
    id: g.id,
    rule_name: g.rule_name,
    applies_to_segment: g.applies_to_segment,
    metric: g.metric,
    operator: g.operator,
    threshold_value: g.threshold_value,
    severity: g.severity,
    notes: g.notes,
  };
}
