import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PricingOutputSchema, type PricingOutput } from "./schemas";
import { getDealContext } from "../tools/crm";

// Model + sampling per docs/03-agents.md §Model selection / §Determinism for the demo.
const MODEL = "claude-sonnet-4-6";
const TEMPERATURE = 0.2;
const MAX_TOKENS = 4096;

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
    };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is required to run the Pricing Agent live (no cache hit).",
    );
  }

  const ctx = getDealContext(dealId);
  const template = readFileSync(PROMPT_PATH, "utf-8");
  const prompt = template
    .replace("{{DEAL_JSON}}", JSON.stringify(ctx.deal, null, 2))
    .replace("{{GUARDRAILS_JSON}}", JSON.stringify(ctx.guardrails, null, 2))
    .replace(
      "{{SIMILAR_DEALS_JSON}}",
      JSON.stringify(ctx.similarDeals, null, 2),
    );

  const client = new Anthropic();
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    messages: [{ role: "user", content: prompt }],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const json = extractJsonObject(text);
  const output = PricingOutputSchema.parse(json);

  // Cache successful hero-scenario outputs for demo determinism.
  // docs/03-agents.md §Determinism for the demo.
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(output, null, 2));

  return {
    output,
    fromCache: false,
    durationMs: Date.now() - start,
    inputTokens: resp.usage.input_tokens ?? null,
    outputTokens: resp.usage.output_tokens ?? null,
  };
}

function extractJsonObject(text: string): unknown {
  // Models occasionally wrap JSON in ```json ... ``` despite instructions, or
  // emit a stray newline before the opening brace. Find the first balanced
  // top-level object and parse it.
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error(
      `Pricing Agent response did not contain a JSON object. Raw: ${text.slice(0, 200)}`,
    );
  }
  return JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
}
