import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getApprovalMatrix, getDealById } from "@/lib/db/queries";
import type { DealWithCustomer } from "@/lib/db/queries";
import { runPricingAgent } from "./pricing-agent";
import { runAsc606Agent } from "./asc606-agent";
import { runRedlineAgent } from "./redline-agent";
import { runApprovalAgent } from "./approval-agent";
import { runCommsAgent } from "./comms-agent";
import {
  executeAgentQuery,
  tinyPause,
  type SubstepEmitter,
  type SubstepEvent,
} from "./_shared";
import {
  fetchCustomerSignals,
  type CustomerSignal,
  type CustomerSignalsResult,
} from "@/lib/tools/exa-search";
import {
  findSimilarDeals,
  type SimilarDealRecord,
} from "@/lib/tools/vector-search";
import {
  failureToRecord,
  postDealReview,
  successToRecord,
  type SlackPostRecord,
} from "@/lib/tools/slack";
import {
  ApprovalOutputSchema,
  Asc606OutputSchema,
  CommsOutputSchema,
  PricingOutputSchema,
  RedlineOutputSchema,
  type ApprovalOutput,
  type Asc606Output,
  type CommsOutput,
  type PricingOutput,
  type RedlineOutput,
} from "./schemas";
import {
  getVisitorReviewCache,
  setVisitorReviewCache,
} from "@/lib/visitor-submit/store";
import { rebuildOrchestratorCacheFromLatestReview } from "@/lib/db/visitor-deals";

// Visitor deals don't write a file-based cache — sweeping cleanup
// would have to chase those files back out of the repo dir. Instead
// they live in the in-memory visitor store and rebuild on cold start
// (the SQL `deal_reviews` row hydrates the page directly when the
// process restarts mid-session).
const VISITOR_DEAL_PREFIX = "visitor-";

// Orchestrator — coordinates the 5 sub-agents per the execution plan in
// docs/03-agents.md §Orchestrator. Critically:
//   • Step 2 fan-out (customer signals + similar deals) runs in parallel
//   • Step 3 fan-out (Pricing + ASC 606 + Redline) runs in PARALLEL via
//     Promise.all — this is the wow-moment of the demo and the reason the
//     full pipeline finishes in ~60s instead of ~150s.
//   • Step 4 (Approval) needs all three Step-3 outputs → sequential
//   • Step 5 (Comms) needs all four upstream outputs → sequential
//   • Step 6 (Synthesis) is an Opus 4.7 call producing the 4-sentence
//     executive summary
//
// Cache file (db/seed/cached_outputs/<deal>-review.json) holds the entire
// reviewed payload + the unified substep tape so cache-hit replays look
// identical to a live run.

// CACHE_VERSION bumped to 4 in Phase 6: cache files now carry slack_post_result
// (the channel/thread_ts/permalink of the original post) so cache replays can
// link to the existing #deal-desk message instead of posting a duplicate.
// v3 caches are treated as stale.
const CACHE_VERSION = 4;
const CACHE_DIR = join(process.cwd(), "db", "seed", "cached_outputs");
const SYNTHESIS_MODEL = "claude-opus-4-7" as const;

export type ParentName =
  | "Orchestrator"
  | "Pricing Agent"
  | "ASC 606 Agent"
  | "Redline Agent"
  | "Approval Agent"
  | "Comms Agent";

export interface OrchestratorSubstepEvent extends SubstepEvent {
  parent: ParentName;
}

interface SubstepTimingEntry extends OrchestratorSubstepEvent {
  elapsed_ms: number;
}

export interface PerAgentMetadata {
  duration_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
}

export interface OrchestratorOutputs {
  pricing: PricingOutput;
  asc606: Asc606Output;
  redline: RedlineOutput;
  approval: ApprovalOutput;
  comms: CommsOutput;
}

export interface OrchestratorMetadata {
  duration_ms: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  recorded_at: string;
  per_agent: {
    pricing: PerAgentMetadata;
    asc606: PerAgentMetadata;
    redline: PerAgentMetadata;
    approval: PerAgentMetadata;
    comms: PerAgentMetadata;
    synthesis: PerAgentMetadata;
  };
}

export interface OrchestratorCacheFile {
  version: typeof CACHE_VERSION;
  deal_id: string;
  outputs: OrchestratorOutputs;
  synthesis: string;
  similar_deals: SimilarDealRecord[];
  customer_signals: CustomerSignalsResult;
  slack_post_result: SlackPostRecord;
  timings: SubstepTimingEntry[];
  metadata: OrchestratorMetadata;
}

export interface RunOrchestratorOptions {
  forceRefresh?: boolean;
  onSubstep?: (e: OrchestratorSubstepEvent) => void;
}

export interface RunOrchestratorResult {
  outputs: OrchestratorOutputs;
  synthesis: string;
  similarDeals: SimilarDealRecord[];
  customerSignals: CustomerSignalsResult;
  // Slack post metadata. status="cached" when the orchestrator served from
  // cache (we skipped re-posting); status="success"/"failed"/"skipped"
  // mirror the live post outcome.
  slackPost: SlackPostRecord;
  fromCache: boolean;
  durationMs: number;
  metadata: OrchestratorMetadata;
}

export async function runOrchestrator(
  dealId: string,
  opts: RunOrchestratorOptions = {},
): Promise<RunOrchestratorResult> {
  const isVisitor = dealId.startsWith(VISITOR_DEAL_PREFIX);
  const cachePath = join(CACHE_DIR, `${dealId}-review.json`);
  const start = Date.now();

  // ---- Cache hit: paced replay of the unified substep tape ----
  // Visitor deals consult the in-memory store first; if absent (e.g.
  // post cold-start), fall back to reconstructing the cache file from
  // the latest deal_reviews row so a refresh never re-fires LLMs.
  // Scenario deals consult the on-disk seed cache.
  if (!opts.forceRefresh) {
    let cached: OrchestratorCacheFile | null;
    if (isVisitor) {
      cached =
        getVisitorReviewCache(dealId) ??
        rebuildOrchestratorCacheFromLatestReview(dealId);
      if (cached) {
        // Re-prime the in-memory cache so subsequent refreshes within
        // the same process skip the SQL rebuild.
        setVisitorReviewCache(dealId, cached);
      }
    } else {
      cached = existsSync(cachePath) ? readCacheFile(cachePath) : null;
    }
    if (cached) {
      await replayTimings(cached.timings, opts.onSubstep, start);
      return {
        outputs: cached.outputs,
        synthesis: cached.synthesis,
        similarDeals: cached.similar_deals,
        customerSignals: cached.customer_signals,
        // Translate the persisted Slack post into status="cached" so the UI
        // shows "Posted previously · view in #deal-desk" rather than firing
        // a fresh post. If the original post failed, we still surface that
        // state — but we don't auto-retry on cache replay.
        slackPost:
          cached.slack_post_result.status === "success"
            ? { ...cached.slack_post_result, status: "cached" }
            : cached.slack_post_result,
        fromCache: true,
        durationMs: Date.now() - start,
        metadata: cached.metadata,
      };
    }
  }

  // ---- Live run ----
  const recordedTimings: SubstepTimingEntry[] = [];
  const fanOutEmit = (parent: ParentName): SubstepEmitter => {
    return (e: SubstepEvent) => {
      const wrapped: OrchestratorSubstepEvent = { ...e, parent };
      recordedTimings.push({ ...wrapped, elapsed_ms: Date.now() - start });
      opts.onSubstep?.(wrapped);
    };
  };
  const orchEmit = fanOutEmit("Orchestrator");

  // ---- Step 1: Fetch deal + customer ----
  orchEmit({
    id: "fetch_deal",
    label: "Fetching deal record and customer",
    status: "running",
  });
  const deal = getDealById(dealId);
  if (!deal) throw new Error(`Deal not found: ${dealId}`);
  await tinyPause(120);
  orchEmit({
    id: "fetch_deal",
    label: `Fetched deal: ${deal.customer.name} — ${deal.name}`,
    status: "complete",
  });

  // ---- Step 2: Parallel fan-out — customer signals (Exa) + similar deals
  // (sqlite-vec). Both are independent — kick them off together, narrate the
  // umbrella step + per-source substeps, and use the result to enrich
  // downstream agent prompts.
  orchEmit({
    id: "step2_fanout",
    label: "Fanning out: customer signals + similar past deals (parallel)",
    status: "running",
  });
  orchEmit({
    id: "step2_signals",
    label: `Querying Exa for ${deal.customer.name} signals (≤6mo)`,
    status: "running",
  });
  orchEmit({
    id: "step2_similar",
    label: "Running k-NN over deal_embeddings (sqlite-vec)",
    status: "running",
  });

  const customerSignalsPromise = fetchCustomerSignals({
    customer: {
      name: deal.customer.name,
      domain: deal.customer.domain,
      is_real: deal.customer.is_real === 1,
      simulated_signals: parseSimulatedSignals(deal.customer.simulated_signals),
    },
  }).then((r) => {
    orchEmit({
      id: "step2_signals",
      label:
        r.signals.length > 0
          ? `Found ${r.signals.length} recent signals for ${deal.customer.name}`
          : r.note ?? "No recent public signals found",
      status: "complete",
    });
    return r;
  });

  const similarDealsPromise = findSimilarDeals(deal.id, 3).then((r) => {
    orchEmit({
      id: "step2_similar",
      label:
        r.length > 0
          ? `Found ${r.length} similar past deals (top: ${r[0].similarity_pct}% match)`
          : "No similar past deals found",
      status: "complete",
    });
    return r;
  });

  const [customerSignals, similarDeals] = await Promise.all([
    customerSignalsPromise,
    similarDealsPromise,
  ]);

  orchEmit({
    id: "step2_fanout",
    label: `Step 2 complete (${customerSignals.signals.length} signals · ${similarDeals.length} similar deals)`,
    status: "complete",
  });

  // ---- Step 3: Parallel fan-out — Pricing + ASC 606 + Redline ----
  orchEmit({
    id: "step3_dispatch",
    label: "Dispatching parallel review: Pricing + ASC 606 + Redline",
    status: "running",
  });
  orchEmit({
    id: "step3_await",
    label: "Awaiting parallel review completion (0 of 3 returned)",
    status: "running",
  });

  let parallelReturned = 0;
  const trackParallelDone = (label: string) => {
    parallelReturned++;
    orchEmit({
      id: "step3_await",
      label: `Awaiting parallel review completion (${parallelReturned} of 3 returned — ${label})`,
      status: "running",
    });
  };

  const [pricingResult, asc606Result, redlineResult] = await Promise.all([
    runPricingAgent(deal.id, {
      onSubstep: fanOutEmit("Pricing Agent"),
      similarDeals,
    }).then((r) => {
      trackParallelDone("Pricing");
      return r;
    }),
    runAsc606Agent(deal, { onSubstep: fanOutEmit("ASC 606 Agent") }).then(
      (r) => {
        trackParallelDone("ASC 606");
        return r;
      },
    ),
    runRedlineAgent(deal, customerSignals, {
      onSubstep: fanOutEmit("Redline Agent"),
    }).then((r) => {
      trackParallelDone("Redline");
      return r;
    }),
  ]);

  orchEmit({
    id: "step3_dispatch",
    label: "Parallel review complete (3 of 3 returned)",
    status: "complete",
  });
  orchEmit({
    id: "step3_await",
    label: "All three parallel agents returned",
    status: "complete",
  });

  // ---- Step 4: Approval (sequential, needs upstream) ----
  orchEmit({
    id: "step4_routing",
    label: "Routing approvals based on upstream outputs",
    status: "running",
  });
  const matrix = getApprovalMatrix();
  const approvalResult = await runApprovalAgent(
    deal,
    matrix,
    pricingResult.output,
    asc606Result.output,
    redlineResult.output,
    { onSubstep: fanOutEmit("Approval Agent") },
  );
  orchEmit({
    id: "step4_routing",
    label: `Routed approvals (${approvalResult.output.approval_chain.length} steps)`,
    status: "complete",
  });

  // ---- Step 5: Comms (sequential, needs Approval) ----
  orchEmit({
    id: "step5_comms",
    label: "Generating communications based on full review",
    status: "running",
  });
  const commsResult = await runCommsAgent(
    deal,
    customerSignals,
    pricingResult.output,
    asc606Result.output,
    redlineResult.output,
    approvalResult.output,
    { onSubstep: fanOutEmit("Comms Agent") },
  );
  orchEmit({
    id: "step5_comms",
    label: "Generated all communication artifacts",
    status: "complete",
  });

  // ---- Step 6: Synthesis (Opus 4.7) + Slack post (best-effort) in parallel
  // Per docs/06-integrations.md §Slack: posting must not block the review.
  // Synthesis is critical — must succeed; Slack is best-effort and never
  // throws (postDealReview returns a typed failure object).
  orchEmit({
    id: "step6_synthesis",
    label: "Synthesizing executive summary",
    status: "running",
  });
  orchEmit({
    id: "step6_slack_post",
    label: "Posting deal review to #deal-desk",
    status: "running",
  });

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";

  const [synthesisSettled, slackSettled] = await Promise.allSettled([
    runSynthesis(
      deal,
      pricingResult.output,
      asc606Result.output,
      redlineResult.output,
      approvalResult.output,
      commsResult.output,
    ),
    postDealReview({
      deal,
      pricing: pricingResult.output,
      asc606: asc606Result.output,
      redline: redlineResult.output,
      approval: approvalResult.output,
      comms: commsResult.output,
      appUrl,
      isVisitorSubmitted: isVisitor,
    }),
  ]);

  if (synthesisSettled.status === "rejected") {
    // Synthesis is critical — let it propagate.
    throw synthesisSettled.reason;
  }
  const synthesis = synthesisSettled.value;
  orchEmit({
    id: "step6_synthesis",
    label: "Synthesized 4-sentence executive overview",
    status: "complete",
  });

  // Slack post never throws (postDealReview catches everything), so the
  // settled-rejected branch shouldn't fire — but handle it defensively.
  const slackResult: SlackPostRecord =
    slackSettled.status === "fulfilled"
      ? slackSettled.value.status === "success"
        ? successToRecord(slackSettled.value)
        : failureToRecord(slackSettled.value)
      : {
          status: "failed",
          channel: null,
          thread_ts: null,
          posted_at: null,
          permalink: null,
          reason: "unknown_error",
          error: String((slackSettled as PromiseRejectedResult).reason),
        };
  orchEmit({
    id: "step6_slack_post",
    label:
      slackResult.status === "success"
        ? `Posted to #deal-desk (${slackResult.thread_ts})`
        : `Slack post failed: ${slackResult.reason ?? "unknown"}`,
    status: "complete",
  });

  // ---- Persist combined cache ----
  const outputs: OrchestratorOutputs = {
    pricing: pricingResult.output,
    asc606: asc606Result.output,
    redline: redlineResult.output,
    approval: approvalResult.output,
    comms: commsResult.output,
  };

  const synthesisMeta: PerAgentMetadata = {
    duration_ms: synthesis.durationMs,
    input_tokens: synthesis.inputTokens,
    output_tokens: synthesis.outputTokens,
    cost_usd: synthesis.costUsd,
  };
  const totalCost =
    (pricingResult.costUsd ?? 0) +
    (asc606Result.costUsd ?? 0) +
    (redlineResult.costUsd ?? 0) +
    (approvalResult.costUsd ?? 0) +
    (commsResult.costUsd ?? 0) +
    (synthesisMeta.cost_usd ?? 0);
  const totalIn =
    (pricingResult.inputTokens ?? 0) +
    (asc606Result.inputTokens ?? 0) +
    (redlineResult.inputTokens ?? 0) +
    (approvalResult.inputTokens ?? 0) +
    (commsResult.inputTokens ?? 0) +
    (synthesisMeta.input_tokens ?? 0);
  const totalOut =
    (pricingResult.outputTokens ?? 0) +
    (asc606Result.outputTokens ?? 0) +
    (redlineResult.outputTokens ?? 0) +
    (approvalResult.outputTokens ?? 0) +
    (commsResult.outputTokens ?? 0) +
    (synthesisMeta.output_tokens ?? 0);
  const durationMs = Date.now() - start;

  const metadata: OrchestratorMetadata = {
    duration_ms: durationMs,
    total_input_tokens: totalIn,
    total_output_tokens: totalOut,
    total_cost_usd: totalCost,
    recorded_at: new Date().toISOString(),
    per_agent: {
      pricing: toMeta(pricingResult),
      asc606: toMeta(asc606Result),
      redline: toMeta(redlineResult),
      approval: toMeta(approvalResult),
      comms: toMeta(commsResult),
      synthesis: synthesisMeta,
    },
  };

  const cacheFile: OrchestratorCacheFile = {
    version: CACHE_VERSION,
    deal_id: dealId,
    outputs,
    synthesis: synthesis.text,
    similar_deals: similarDeals,
    customer_signals: customerSignals,
    slack_post_result: slackResult,
    timings: recordedTimings,
    metadata,
  };
  if (isVisitor) {
    setVisitorReviewCache(dealId, cacheFile);
  } else {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(cacheFile, null, 2));
  }

  return {
    outputs,
    synthesis: synthesis.text,
    similarDeals,
    customerSignals,
    slackPost: slackResult,
    fromCache: false,
    durationMs,
    metadata,
  };
}

function toMeta<T>(r: {
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}): PerAgentMetadata {
  return {
    duration_ms: r.durationMs,
    input_tokens: r.inputTokens,
    output_tokens: r.outputTokens,
    cost_usd: r.costUsd,
  };
}

async function runSynthesis(
  deal: DealWithCustomer,
  pricing: PricingOutput,
  asc606: Asc606Output,
  redline: RedlineOutput,
  approval: ApprovalOutput,
  comms: CommsOutput,
): Promise<{
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  durationMs: number;
}> {
  const start = Date.now();
  const systemPrompt = `You are the orchestrator agent on Clay's deal desk. Your job is to read the five sub-agent outputs and produce a four-sentence executive overview that the deal lead can read in 20 seconds before they walk into a meeting.

Each sentence must cite the most important finding from one of: Pricing, ASC 606, Redline, Approval. Sentence four can either cover Comms (the recommended customer tone) OR a synthesis "ship / hold / re-scope" call.

Tone: direct, factual, no marketing voice. No bullet points. No headings. Plain prose. Exactly 3-5 sentences. No JSON, no code fences — just the prose summary.`;

  const userMessage = [
    `Deal: ${deal.customer.name} — ${deal.name} (${deal.deal_type}, ${formatMoney(deal.acv)} ACV / ${formatMoney(deal.tcv)} TCV)`,
    "",
    `Pricing summary: ${pricing.reasoning_summary}`,
    `Effective discount: ${pricing.effective_discount_pct.toFixed(1)}% · margin estimate: ${pricing.margin_pct_estimate.toFixed(1)}%`,
    "",
    `ASC 606 summary: ${asc606.reasoning_summary}`,
    `Red flags: ${asc606.red_flags.length} · contract modification at risk: ${asc606.contract_modification_risk.is_at_risk}`,
    "",
    `Redline summary: ${redline.reasoning_summary}`,
    `Flagged clauses: ${redline.flagged_clauses.length} · overall priority: ${redline.overall_redline_priority}`,
    "",
    `Approval summary: ${approval.reasoning_summary}`,
    `Approval chain: ${approval.approval_chain.map((s) => s.approver_role).join(" → ")}`,
    `Expected cycle time: ${approval.expected_cycle_time_business_days} business days`,
    "",
    `Comms summary: ${comms.reasoning_summary}`,
    `Recommended customer tone: ${comms.customer_email_draft.tone}`,
    "",
    "Write the 3-5 sentence executive overview now.",
  ].join("\n");

  const result = await executeAgentQuery({
    model: SYNTHESIS_MODEL,
    systemPrompt,
    userMessage,
    maxTurns: 1,
  });

  return {
    text: result.assistantText.trim(),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    durationMs: Date.now() - start,
  };
}

// customers.simulated_signals is a JSON-encoded CustomerSignal[]. Parse
// defensively — a malformed value should fall through to the empty-result
// branch rather than blow up the orchestrator.
function parseSimulatedSignals(raw: string | null): CustomerSignal[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CustomerSignal[]) : null;
  } catch {
    return null;
  }
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

async function replayTimings(
  timings: SubstepTimingEntry[],
  emit: ((e: OrchestratorSubstepEvent) => void) | undefined,
  start: number,
) {
  for (const t of timings) {
    const wait = t.elapsed_ms - (Date.now() - start);
    if (wait > 0) {
      await new Promise<void>((res) => setTimeout(res, wait));
    }
    emit?.({
      id: t.id,
      label: t.label,
      status: t.status,
      parent: t.parent,
    });
  }
}

const OutputsSchema = (() => {
  // Reused inside readCacheFile — defined here so we don't recompute on every
  // read.
  return {
    pricing: PricingOutputSchema,
    asc606: Asc606OutputSchema,
    redline: RedlineOutputSchema,
    approval: ApprovalOutputSchema,
    comms: CommsOutputSchema,
  };
})();

function readCacheFile(cachePath: string): OrchestratorCacheFile | null {
  try {
    const raw = JSON.parse(readFileSync(cachePath, "utf-8")) as unknown;
    if (
      !raw ||
      typeof raw !== "object" ||
      !("version" in raw) ||
      (raw as { version?: number }).version !== CACHE_VERSION
    ) {
      return null;
    }
    const wrapped = raw as OrchestratorCacheFile;
    // Validate every embedded output against the current schemas; if any
    // schema evolved, treat the cache as stale.
    const checks = [
      OutputsSchema.pricing.safeParse(wrapped.outputs?.pricing),
      OutputsSchema.asc606.safeParse(wrapped.outputs?.asc606),
      OutputsSchema.redline.safeParse(wrapped.outputs?.redline),
      OutputsSchema.approval.safeParse(wrapped.outputs?.approval),
      OutputsSchema.comms.safeParse(wrapped.outputs?.comms),
    ];
    if (checks.some((c) => !c.success)) return null;
    return wrapped;
  } catch {
    return null;
  }
}
