import { query } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PricingOutputSchema, type PricingOutput } from "./schemas";
import { getDealContext } from "../tools/crm";
import { CRM_TOOL_NAMES, crmMcpServer } from "../mcp-servers/crm-server";

// Pricing Agent — driven through @anthropic-ai/claude-agent-sdk's query().
//
// The SDK is the framework even though Phase 3's Pricing Agent is a leaf-node
// reasoning task: data is fed inline via the user message and the agent
// returns a single JSON object. Registering the `crm` MCP server keeps the
// architecture honest — Phase 4's orchestrator will exercise these same
// tools to gather context before fanning out to sub-agents.

const MODEL = "claude-sonnet-4-6";

const PROMPT_PATH = join(
  process.cwd(),
  "lib",
  "prompts",
  "pricing-agent.md",
);
const CACHE_DIR = join(process.cwd(), "db", "seed", "cached_outputs");

export interface RunPricingOptions {
  forceRefresh?: boolean;
}

export interface RunPricingResult {
  output: PricingOutput;
  fromCache: boolean;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

export async function runPricingAgent(
  dealId: string,
  opts: RunPricingOptions = {},
): Promise<RunPricingResult> {
  const cachePath = join(CACHE_DIR, `${dealId}-pricing.json`);
  const start = Date.now();

  if (!opts.forceRefresh && existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, "utf-8")) as unknown;
    const output = PricingOutputSchema.parse(cached);
    return {
      output,
      fromCache: true,
      durationMs: Date.now() - start,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
    };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is required to run the Pricing Agent live (no cache hit).",
    );
  }

  const ctx = getDealContext(dealId);
  const systemPrompt = readFileSync(PROMPT_PATH, "utf-8");
  const userMessage = buildUserMessage(ctx);

  // Drive the agent through the SDK. settingSources: [] keeps the run
  // hermetic (no ~/.claude or .claude/settings.json bleed). tools: [] disables
  // built-in Claude Code tools (Bash/Read/Write/Edit/etc.) so the only
  // surface available is the MCP server we register.
  const session = query({
    prompt: userMessage,
    options: {
      model: MODEL,
      systemPrompt,
      tools: [],
      mcpServers: { crm: crmMcpServer },
      allowedTools: [...CRM_TOOL_NAMES],
      settingSources: [],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      // The Pricing Agent is bounded reasoning over a fixed payload. Skip the
      // adaptive-thinking warmup Sonnet 4.6 does by default — it doubles
      // latency and tokens without changing the structured output.
      thinking: { type: "disabled" },
      effort: "low",
      // Phase 3 doesn't need an agent loop — the deal payload is already in
      // the user message. maxTurns=2 leaves headroom for one tool call if
      // the model decides it wants to verify a value, but caps the loop.
      maxTurns: 2,
    },
  });

  let assistantText = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let costUsd: number | null = null;
  let resultErrored = false;
  let resultErrorMessage: string | null = null;

  for await (const msg of session) {
    if (msg.type === "result") {
      if (msg.subtype === "success") {
        assistantText = msg.result;
        inputTokens = msg.usage?.input_tokens ?? null;
        outputTokens = msg.usage?.output_tokens ?? null;
        costUsd = msg.total_cost_usd ?? null;
      } else {
        resultErrored = true;
        resultErrorMessage =
          (msg as { subtype?: string }).subtype ?? "unknown agent error";
      }
    }
  }

  if (resultErrored || !assistantText) {
    throw new Error(
      `Pricing Agent did not produce a final assistant message${
        resultErrorMessage ? `: ${resultErrorMessage}` : ""
      }`,
    );
  }

  const json = extractJsonObject(assistantText);
  const output = PricingOutputSchema.parse(json);

  // Cache successful hero-scenario outputs for demo determinism.
  // docs/03-agents.md §Determinism for the demo.
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(output, null, 2));

  return {
    output,
    fromCache: false,
    durationMs: Date.now() - start,
    inputTokens,
    outputTokens,
    costUsd,
  };
}

function buildUserMessage(ctx: ReturnType<typeof getDealContext>): string {
  return [
    "Review the following deal and return a `PricingOutput` JSON object as specified in your system prompt. Do not call any tools — every input you need is below.",
    "",
    "## Active deal under review",
    "```json",
    JSON.stringify(ctx.deal, null, 2),
    "```",
    "",
    "## Active pricing guardrails (scoped to deal segment + universal)",
    "```json",
    JSON.stringify(ctx.guardrails, null, 2),
    "```",
    "",
    "## Top similar past deals (precedent context)",
    "```json",
    JSON.stringify(ctx.similarDeals, null, 2),
    "```",
    "",
    "Return one JSON object now. No preamble. No code fences. JSON only.",
  ].join("\n");
}

function extractJsonObject(text: string): unknown {
  // Models occasionally wrap JSON in ```json ... ``` despite instructions, or
  // emit a stray newline before the opening brace. Find the first balanced
  // top-level object and parse it.
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error(
      `Pricing Agent response did not contain a JSON object. Raw: ${text.slice(0, 200)}`,
    );
  }
  return JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
}
