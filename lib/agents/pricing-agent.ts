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
//
// Cache file layout (db/seed/cached_outputs/<deal>-pricing.json) is a
// versioned wrapper (`CacheFile`) carrying the structured output plus the
// timing tape from the original live run. Cache hits paced-replay the
// timing tape so the demo path looks indistinguishable from a live run.

const MODEL = "claude-sonnet-4-6";
const CACHE_VERSION = 1;

const PROMPT_PATH = join(
  process.cwd(),
  "lib",
  "prompts",
  "pricing-agent.md",
);
const CACHE_DIR = join(process.cwd(), "db", "seed", "cached_outputs");

// Stable substep ids the client knows about. Order is the canonical sequence
// shown in the timeline (PRICING_SUBSTEPS in components/reasoning-stream.tsx
// mirrors this for the UI).
export type PricingSubstepId =
  | "fetch_deal"
  | "load_guardrails"
  | "similar_deals"
  | "reasoning"
  | "guardrail_eval"
  | "alternatives"
  | "margin_sensitivity"
  | "finalizing";

export interface SubstepEvent {
  id: PricingSubstepId;
  label: string;
  status: "running" | "complete";
}

interface SubstepTiming extends SubstepEvent {
  // Milliseconds from the start of the agent run when the event fired.
  // Used by cache-hit paced replay to reproduce the original cadence.
  elapsed_ms: number;
}

interface CacheFile {
  version: typeof CACHE_VERSION;
  output: PricingOutput;
  timings: SubstepTiming[];
  metadata: {
    duration_ms: number;
    input_tokens: number | null;
    output_tokens: number | null;
    cost_usd: number | null;
    recorded_at: string;
  };
}

export interface RunPricingOptions {
  forceRefresh?: boolean;
  onSubstep?: (event: SubstepEvent) => void;
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

  // ---- Cache hit: paced replay of the original substep tape ----
  if (!opts.forceRefresh && existsSync(cachePath)) {
    const cached = readCacheFile(cachePath);
    if (cached) {
      await replayTimings(cached.timings, opts.onSubstep, start);
      return {
        output: cached.output,
        fromCache: true,
        durationMs: Date.now() - start,
        inputTokens: cached.metadata.input_tokens,
        outputTokens: cached.metadata.output_tokens,
        costUsd: cached.metadata.cost_usd,
      };
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is required to run the Pricing Agent live (no cache hit).",
    );
  }

  // Live run. Wrap onSubstep so every emission is also taped to disk for
  // future replays.
  const recordedTimings: SubstepTiming[] = [];
  const emit = (e: SubstepEvent) => {
    recordedTimings.push({ ...e, elapsed_ms: Date.now() - start });
    opts.onSubstep?.(e);
  };

  // ---- Substep 1: deal fetch ----
  emit({ id: "fetch_deal", label: "Fetching deal record from CRM", status: "running" });
  const ctx = getDealContext(dealId);
  emit({ id: "fetch_deal", label: "Fetched deal record from CRM", status: "complete" });

  // ---- Substep 2: guardrails load ----
  const segmentLabel = humanizeSegment(ctx.deal.customer.segment);
  emit({
    id: "load_guardrails",
    label: `Loading active pricing guardrails for ${segmentLabel} segment`,
    status: "running",
  });
  // The guardrails are already inside ctx — emitting the boundary explicitly
  // so the user sees the work happen even though it cost <1ms.
  await tinyPause(200);
  emit({
    id: "load_guardrails",
    label: `Loaded ${ctx.guardrails.length} guardrails for ${segmentLabel} segment`,
    status: "complete",
  });

  // ---- Substep 3: similar deals (Phase 5 stub) ----
  emit({
    id: "similar_deals",
    label: "Identifying similar past deals via vector search",
    status: "running",
  });
  await tinyPause(300);
  emit({
    id: "similar_deals",
    label:
      ctx.similarDeals.length > 0
        ? `Found ${ctx.similarDeals.length} similar past deals`
        : "Vector search returns no precedent set (Phase 5 stub)",
    status: "complete",
  });

  // ---- Substep 4: LLM reasoning starts ----
  emit({
    id: "reasoning",
    label: "Reasoning about pricing economics",
    status: "running",
  });

  const systemPrompt = readFileSync(PROMPT_PATH, "utf-8");
  const userMessage = buildUserMessage(ctx);

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
      thinking: { type: "disabled" },
      effort: "low",
      maxTurns: 2,
      // Stream raw deltas so we can pattern-match field appearances and
      // emit (N of 6) / (N of 3) substeps in real time as the model writes.
      includePartialMessages: true,
    },
  });

  const watcher = new StreamWatcher(emit, ctx.guardrails.length);
  let assistantText = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let costUsd: number | null = null;
  let resultErrored = false;
  let resultErrorMessage: string | null = null;

  for await (const msg of session) {
    if (msg.type === "stream_event") {
      const ev = msg.event;
      if (ev.type === "content_block_delta" && "delta" in ev) {
        const delta = ev.delta as { type?: string; text?: string };
        if (delta.type === "text_delta" && typeof delta.text === "string") {
          watcher.feed(delta.text);
        }
      }
      continue;
    }
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

  // Close out any sub-stages the watcher started but didn't get to finalize
  // (e.g. if guardrail count ended up smaller than expected).
  watcher.flushOpen();
  emit({ id: "reasoning", label: "Reasoned about pricing economics", status: "complete" });

  // ---- Substep 7: margin sensitivity (post-parse derivation) ----
  emit({
    id: "margin_sensitivity",
    label: "Computing margin sensitivity under the 40% list-price baseline",
    status: "running",
  });
  const json = extractJsonObject(assistantText);
  const output = PricingOutputSchema.parse(json);
  await tinyPause(150);
  emit({
    id: "margin_sensitivity",
    label: `Computed margin sensitivity (${output.margin_pct_estimate.toFixed(1)}% est.)`,
    status: "complete",
  });

  // ---- Substep 8: finalize ----
  emit({
    id: "finalizing",
    label: "Finalizing recommendation",
    status: "running",
  });
  const durationMs = Date.now() - start;
  const cacheFile: CacheFile = {
    version: CACHE_VERSION,
    output,
    timings: recordedTimings,
    metadata: {
      duration_ms: durationMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      recorded_at: new Date().toISOString(),
    },
  };
  // Note: the trailing "finalizing complete" emission below isn't yet on the
  // tape — we add it manually after writing the file so the cached replay
  // carries the same number of events.
  cacheFile.timings.push({
    id: "finalizing",
    label: `Finalized recommendation (${output.confidence} confidence)`,
    status: "complete",
    elapsed_ms: durationMs + 120,
  });
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cacheFile, null, 2));
  await tinyPause(120);
  emit({
    id: "finalizing",
    label: `Finalized recommendation (${output.confidence} confidence)`,
    status: "complete",
  });

  return {
    output,
    fromCache: false,
    durationMs: Date.now() - start,
    inputTokens,
    outputTokens,
    costUsd,
  };
}

// Replay the recorded substep tape on its original cadence. Each substep
// fires when its `elapsed_ms` matches the wall clock since `start`. If the
// caller didn't pass an onSubstep handler we still honor the timing so the
// route's deal_review row reflects the realistic duration.
async function replayTimings(
  timings: SubstepTiming[],
  emit: ((e: SubstepEvent) => void) | undefined,
  start: number,
) {
  for (const t of timings) {
    const targetElapsed = t.elapsed_ms;
    const actual = Date.now() - start;
    const wait = targetElapsed - actual;
    if (wait > 0) {
      await new Promise<void>((res) => setTimeout(res, wait));
    }
    emit?.({ id: t.id, label: t.label, status: t.status });
  }
}

// Read the cache file. Returns null on an unrecognized format so callers
// fall through to a live run instead of crashing on a stale schema.
function readCacheFile(cachePath: string): CacheFile | null {
  try {
    const raw = JSON.parse(readFileSync(cachePath, "utf-8")) as unknown;
    if (
      raw &&
      typeof raw === "object" &&
      "version" in raw &&
      (raw as { version?: number }).version === CACHE_VERSION &&
      "output" in raw &&
      "timings" in raw
    ) {
      const wrapped = raw as CacheFile;
      // Validate the output still parses against the current schema; if the
      // schema evolved, treat the cache as stale.
      const parsed = PricingOutputSchema.safeParse(wrapped.output);
      if (!parsed.success) return null;
      return { ...wrapped, output: parsed.data };
    }
  } catch {
    // Fall through to "no cache" — the live path will overwrite the file.
  }
  return null;
}

// Watches streamed text for schema-field landmarks. The JSON itself is never
// safe to incrementally parse, but field names and array-element openers are
// stable string anchors — we count those, not parse JSON. Two pieces of state
// drive substep emissions: which array we're inside (guardrails vs.
// alternatives), and how many elements we've seen close.
class StreamWatcher {
  private acc = "";
  private guardrailsStarted = false;
  private alternativesStarted = false;
  private guardrailCount = 0;
  private alternativeCount = 0;
  private guardrailRunning = false;
  private alternativesRunning = false;
  private readonly expectedGuardrails: number;

  constructor(
    private readonly emit: (e: SubstepEvent) => void,
    expectedGuardrails: number,
  ) {
    this.expectedGuardrails = expectedGuardrails;
  }

  feed(chunk: string) {
    this.acc += chunk;

    // Guardrails substep boundary — fires the first time we see the field key.
    if (!this.guardrailsStarted && this.acc.includes('"guardrail_evaluations"')) {
      this.guardrailsStarted = true;
      this.guardrailRunning = true;
      this.emit({
        id: "guardrail_eval",
        label: `Evaluating guardrails (0 of ${this.expectedGuardrails})`,
        status: "running",
      });
    }

    // Count individual guardrail entries by looking for the `"explanation"`
    // field that closes each entry inside the guardrail_evaluations array.
    if (this.guardrailRunning) {
      const seen = countOccurrences(this.acc, '"explanation"');
      while (this.guardrailCount < seen) {
        this.guardrailCount++;
        this.emit({
          id: "guardrail_eval",
          label: `Evaluating guardrails (${this.guardrailCount} of ${this.expectedGuardrails})`,
          status: "running",
        });
      }
    }

    // Alternatives substep — start firing once the field key shows up.
    if (!this.alternativesStarted && this.acc.includes('"alternative_structures"')) {
      this.alternativesStarted = true;
      // Close out the guardrails substep cleanly.
      if (this.guardrailRunning) {
        this.guardrailRunning = false;
        this.emit({
          id: "guardrail_eval",
          label: `Evaluated ${this.guardrailCount} guardrails`,
          status: "complete",
        });
      }
      this.alternativesRunning = true;
      this.emit({
        id: "alternatives",
        label: "Generating alternative structures (0 of 3)",
        status: "running",
      });
    }

    // Count alternative_structures entries via their `"rationale"` field.
    if (this.alternativesRunning) {
      const seen = countOccurrences(this.acc, '"rationale"');
      while (this.alternativeCount < seen) {
        this.alternativeCount++;
        this.emit({
          id: "alternatives",
          label: `Generating alternative structures (${this.alternativeCount} of 3)`,
          status: "running",
        });
      }
    }

    // The reasoning_summary field appears after both arrays close — use it as
    // the signal that the alternatives substep has wrapped.
    if (
      this.alternativesRunning &&
      this.acc.includes('"reasoning_summary"')
    ) {
      this.alternativesRunning = false;
      this.emit({
        id: "alternatives",
        label: `Generated ${this.alternativeCount} alternative structures`,
        status: "complete",
      });
    }
  }

  flushOpen() {
    if (this.guardrailRunning) {
      this.guardrailRunning = false;
      this.emit({
        id: "guardrail_eval",
        label: `Evaluated ${this.guardrailCount} guardrails`,
        status: "complete",
      });
    }
    if (this.alternativesRunning) {
      this.alternativesRunning = false;
      this.emit({
        id: "alternatives",
        label: `Generated ${this.alternativeCount} alternative structures`,
        status: "complete",
      });
    }
  }
}

function countOccurrences(haystack: string, needle: string): number {
  let i = 0;
  let count = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    count++;
    i += needle.length;
  }
  return count;
}

function humanizeSegment(segment: string): string {
  switch (segment) {
    case "enterprise":
      return "enterprise";
    case "mid_market":
      return "mid-market";
    case "plg_self_serve":
      return "PLG";
    default:
      return segment;
  }
}

function tinyPause(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
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
