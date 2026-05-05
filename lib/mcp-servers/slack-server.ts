import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getDealById } from "@/lib/db/queries";
import {
  postDealReview,
  type SlackPostResult,
} from "@/lib/tools/slack";
import {
  ApprovalOutputSchema,
  Asc606OutputSchema,
  CommsOutputSchema,
  PricingOutputSchema,
  RedlineOutputSchema,
} from "@/lib/agents/schemas";

// Slack MCP server. Exposes `post_deal_review` so agents can request a Slack
// post via the standard tool interface. Phase 6 routes posts through the
// orchestrator (which calls postDealReview() directly), but the MCP surface
// is registered so future agents — including Comms — can call it themselves.
//
// The tool accepts the typed agent outputs as input rather than asking the
// model to assemble Block Kit JSON. The blocks are built deterministically
// inside lib/tools/slack.ts so every post matches the docs/06 spec.

const postDealReviewTool = tool(
  "post_deal_review",
  "Post a deal-review summary to the demo workspace's #deal-desk channel. Builds a deterministic Block Kit message from the typed Pricing/ASC 606/Redline/Approval/Comms outputs. Best-effort — never throws; returns a `failed` status object on any error.",
  {
    deal_id: z.string().describe("CRM deal id, e.g. 'deal_anthropic_2026q1_expansion'"),
    pricing: PricingOutputSchema,
    asc606: Asc606OutputSchema,
    redline: RedlineOutputSchema,
    approval: ApprovalOutputSchema,
    comms: CommsOutputSchema,
    app_url: z
      .string()
      .url()
      .describe("Public app base URL — used to construct the link back to the deal page in the post's context block."),
  },
  async (args) => {
    const deal = getDealById(args.deal_id);
    if (!deal) {
      const failure: SlackPostResult = {
        status: "failed",
        reason: "unknown_error",
        error: `Deal not found: ${args.deal_id}`,
        retry_after_seconds: null,
      };
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(failure) },
        ],
        isError: true,
      };
    }

    const result = await postDealReview({
      deal,
      pricing: args.pricing,
      asc606: args.asc606,
      redline: args.redline,
      approval: args.approval,
      comms: args.comms,
      appUrl: args.app_url,
    });

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(result) },
      ],
      isError: result.status === "failed",
    };
  },
);

export const slackMcpServer = createSdkMcpServer({
  name: "slack",
  version: "0.1.0",
  tools: [postDealReviewTool],
});

export const SLACK_TOOL_NAMES = ["mcp__slack__post_deal_review"] as const;
