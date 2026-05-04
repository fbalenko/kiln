import {
  getDealById,
  getPricingGuardrails,
  type DealWithCustomer,
  type PricingGuardrail,
} from "@/lib/db/queries";

// Tool surface the agents call into. Phase 3: synchronous, in-process — these
// just wrap the SQLite queries. Phase 4 will expose the same surface as MCP
// tools the orchestrator dispatches to. Keeping the function signatures stable
// now so the upgrade is mechanical.

export interface DealContext {
  deal: DealWithCustomer;
  guardrails: PricingGuardrail[];
  similarDeals: DealWithCustomer[];
}

export function getDealContext(dealId: string): DealContext {
  const deal = getDealById(dealId);
  if (!deal) throw new Error(`Deal not found: ${dealId}`);

  const guardrails = getPricingGuardrails().filter(
    (g) =>
      !g.applies_to_segment || g.applies_to_segment === deal.customer.segment,
  );

  // Vector search lands in Phase 5. For Phase 3 the Pricing Agent runs against
  // an empty precedent set, which the prompt explicitly handles.
  const similarDeals: DealWithCustomer[] = [];

  return { deal, guardrails, similarDeals };
}
