import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  findSimilarDeals,
  type SimilarDealRecord,
} from "@/lib/tools/vector-search";

// In-process MCP server exposing the sqlite-vec k-NN over `deal_embeddings`.
// The orchestrator calls this once per review; downstream agents never call it
// directly (they receive the result inline).

const findSimilarDealsTool = tool(
  "find_similar_deals",
  "Find the most similar past deals by embedding cosine distance, scoped to seeded institutional memory. Excludes the source deal itself. Returns the top-k (default 3) deals each with: customer + segment, headline outcome (won/lost/active), one-line decision note, similarity score 0-100.",
  {
    deal_id: z.string().describe("The deal whose nearest neighbors to fetch."),
    k: z
      .number()
      .int()
      .min(1)
      .max(8)
      .optional()
      .describe("How many similar deals to return (default 3)."),
  },
  async ({ deal_id, k }) => {
    const results = await findSimilarDeals(deal_id, k ?? 3);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(results.map(serializeSimilar)),
        },
      ],
    };
  },
);

export const vectorMcpServer = createSdkMcpServer({
  name: "vector",
  version: "0.1.0",
  tools: [findSimilarDealsTool],
});

export const VECTOR_TOOL_NAMES = [
  "mcp__vector__find_similar_deals",
] as const;

function serializeSimilar(r: SimilarDealRecord) {
  return {
    deal_id: r.deal_id,
    deal_name: r.deal_name,
    customer_name: r.customer_name,
    customer_segment: r.customer_segment,
    deal_type: r.deal_type,
    stage: r.stage,
    acv: r.acv,
    discount_pct: r.discount_pct,
    decision_note: r.decision_note,
    similarity_pct: r.similarity_pct,
  };
}
