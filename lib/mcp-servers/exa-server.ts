import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { fetchCustomerSignals } from "@/lib/tools/exa-search";

// In-process MCP server exposing Exa-backed customer signals to the agents.
// The orchestrator calls this once during Step 2 fan-out and feeds the result
// inline to Redline + Comms.

const customerSignalsTool = tool(
  "customer_signals",
  "Fetch recent (≤6 months) public signals about a customer via Exa. Returns up to 5 signals (funding, leadership change, product launch). On failure or empty result, returns an empty `signals` array — never throws. Cache: 24h per customer domain.",
  {
    customer_name: z
      .string()
      .describe("The customer company name as it appears in CRM."),
    customer_domain: z
      .string()
      .describe("The customer's primary domain, e.g. 'anthropic.com'."),
  },
  async ({ customer_name, customer_domain }) => {
    const result = await fetchCustomerSignals({
      customer: { name: customer_name, domain: customer_domain },
    });
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(result) },
      ],
    };
  },
);

export const exaMcpServer = createSdkMcpServer({
  name: "exa",
  version: "0.1.0",
  tools: [customerSignalsTool],
});

export const EXA_TOOL_NAMES = ["mcp__exa__customer_signals"] as const;
