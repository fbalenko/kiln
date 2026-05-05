import {
  getDealById,
  getPricingGuardrails,
  type DealWithCustomer,
  type PricingGuardrail,
} from "@/lib/db/queries";
import type { SimilarDealRecord } from "@/lib/tools/vector-search";

// Tool surface the agents call into. Synchronous, in-process — these just
// wrap the SQLite queries. The same surface is also exposed as MCP tools
// (lib/mcp-servers/crm-server.ts) for the orchestrator + sub-agents.
//
// Phase 5: similarDeals is now sourced from the vector-search helper and
// passed in by the caller (the orchestrator's Step 2 fan-out fetches it once
// and threads it into the Pricing Agent). Standalone callers may invoke
// getDealContext() and pass `similarDeals: []` — Pricing's prompt explicitly
// handles an empty precedent set.

export interface DealContext {
  deal: DealWithCustomer;
  guardrails: PricingGuardrail[];
  similarDeals: SimilarDealRecord[];
}

export function getDealContext(
  dealId: string,
  similarDeals: SimilarDealRecord[] = [],
): DealContext {
  const deal = getDealById(dealId);
  if (!deal) throw new Error(`Deal not found: ${dealId}`);

  const guardrails = getPricingGuardrails().filter(
    (g) =>
      !g.applies_to_segment || g.applies_to_segment === deal.customer.segment,
  );

  return { deal, guardrails, similarDeals };
}
