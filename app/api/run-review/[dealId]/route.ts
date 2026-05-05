import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { runOrchestrator, type ParentName } from "@/lib/agents/orchestrator";
import { getDb } from "@/lib/db/client";
import { getDealById } from "@/lib/db/queries";

// SSE endpoint for the full Phase 4 orchestrator pipeline.
//
// Stream contract (docs/03-agents.md §Streaming contract, extended in Phase 4
// for multi-agent coordination):
//   step_start    — orchestrator marking a top-level step as begun
//   step_complete — orchestrator marking a top-level step as done
//   substep       — { parent, id, label, status } substep events from the
//                    orchestrator OR any of the 5 sub-agents (parent names
//                    them: "Pricing Agent", "Orchestrator", etc.)
//   step_progress — agent-specific structured-output reveal slices (kept
//                    for the post-completion field-by-field reveal of each
//                    agent's payload)
//   synthesis     — final 4-sentence executive overview + review_id
//   error         — agent failed mid-stream
//
// The orchestrator itself owns the cache. ?live=1 → forceRefresh: true.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ dealId: string }>;
}

const FIELD_REVEAL_INTERVAL_MS = 140;

type StreamEvent =
  | { type: "step_start"; step: ParentName; ts: number }
  | { type: "step_progress"; step: ParentName; partial_output: unknown; ts: number }
  | { type: "step_complete"; step: ParentName; output: unknown; ts: number }
  | {
      type: "substep";
      parent: ParentName;
      id: string;
      label: string;
      status: "running" | "complete";
      ts: number;
    }
  | { type: "synthesis"; summary: string; review_id: string; ts: number }
  | { type: "error"; step: ParentName; message: string; ts: number };

const AGENT_STEPS: ParentName[] = [
  "Orchestrator",
  "Pricing Agent",
  "ASC 606 Agent",
  "Redline Agent",
  "Approval Agent",
  "Comms Agent",
];

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { dealId } = await params;
  const forceRefresh = req.nextUrl.searchParams.get("live") === "1";
  const deal = getDealById(dealId);
  if (!deal) {
    return new Response(JSON.stringify({ error: "deal_not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (e: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const sleep = (ms: number) =>
        new Promise<void>((res) => setTimeout(res, ms));

      // Track which agent steps we've opened so we know which ones to mark
      // complete when their first substep completes / their last substep
      // closes. The orchestrator emits substeps with `parent`; we lift the
      // first running substep for a given parent into a step_start event,
      // and the last "complete" substep into a step_complete carrying the
      // full agent output (set after the orchestrator returns).
      const opened = new Set<ParentName>();
      const lastSubstepStatusByParent = new Map<
        ParentName,
        { id: string; status: "running" | "complete" }
      >();

      try {
        const orchestratorStart = Date.now();

        const result = await runOrchestrator(dealId, {
          forceRefresh,
          onSubstep: (e) => {
            // Lazily open the parent's step the first time we see it.
            if (!opened.has(e.parent)) {
              opened.add(e.parent);
              send({
                type: "step_start",
                step: e.parent,
                ts: Date.now(),
              });
            }
            lastSubstepStatusByParent.set(e.parent, {
              id: e.id,
              status: e.status,
            });
            send({
              type: "substep",
              parent: e.parent,
              id: e.id,
              label: e.label,
              status: e.status,
              ts: Date.now(),
            });
          },
        });

        // After the orchestrator returns, fire field-by-field reveal of each
        // sub-agent's structured output, then a step_complete event carrying
        // the full payload + per-agent metadata.
        const meta = result.metadata.per_agent;
        await emitAgentReveal(send, "Pricing Agent", result.outputs.pricing, meta.pricing);
        await emitAgentReveal(send, "ASC 606 Agent", result.outputs.asc606, meta.asc606);
        await emitAgentReveal(send, "Redline Agent", result.outputs.redline, meta.redline);
        await emitAgentReveal(send, "Approval Agent", result.outputs.approval, meta.approval);
        await emitAgentReveal(send, "Comms Agent", result.outputs.comms, meta.comms);

        // Orchestrator step itself has no structured output — just its
        // synthesis text. Send a step_complete so the UI flips its dot.
        for (const stepName of AGENT_STEPS) {
          if (opened.has(stepName)) {
            // Pricing/ASC606/etc. were already step_completed inside
            // emitAgentReveal. Orchestrator wasn't — handle it here.
            if (stepName === "Orchestrator") {
              send({
                type: "step_complete",
                step: stepName,
                output: { synthesis: result.synthesis, metadata: result.metadata },
                ts: Date.now(),
              });
            }
          }
        }

        // ---- Persist deal_review + audit_log ----
        const reviewId = `rev_${randomUUID()}`;
        const totalRuntimeMs = Date.now() - orchestratorStart;
        persistReview({
          reviewId,
          dealId,
          outputs: result.outputs,
          synthesis: result.synthesis,
          totalRuntimeMs,
          totalTokens:
            result.metadata.total_input_tokens +
            result.metadata.total_output_tokens,
          fromCache: result.fromCache,
          customerSignals: { source: "exa_stub", note: "Phase 5" },
          similarDeals: [],
        });

        // ---- Synthesis card ----
        send({
          type: "synthesis",
          summary: result.synthesis,
          review_id: reviewId,
          ts: Date.now(),
        });

        // Tiny tail to let the UI paint the synthesis transition.
        await sleep(60);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown orchestrator error";
        console.error("[run-review] Orchestrator failed:", err);
        send({
          type: "error",
          step: "Orchestrator",
          message,
          ts: Date.now(),
        });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* already closed by the client */
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}

// Slice the agent's structured output into 2-3 progressively-populated
// partials, then fire a final step_complete with the full payload + metadata.
// The slicing is per-agent because each schema has different "headline" vs
// "detail" sections.
async function emitAgentReveal(
  send: (e: StreamEvent) => void,
  step: ParentName,
  output: Record<string, unknown>,
  meta: { duration_ms: number; input_tokens: number | null; output_tokens: number | null; cost_usd: number | null },
) {
  const sleep = (ms: number) =>
    new Promise<void>((res) => setTimeout(res, ms));

  // Two slices: headline keys (the fields the user wants to see first), then
  // the rest. step_complete carries the full output + meta.
  const headlineKeys = HEADLINE_KEYS[step] ?? Object.keys(output);
  const headline: Record<string, unknown> = {};
  for (const k of headlineKeys) {
    if (k in output) headline[k] = output[k];
  }

  send({
    type: "step_progress",
    step,
    partial_output: headline,
    ts: Date.now(),
  });
  await sleep(FIELD_REVEAL_INTERVAL_MS);

  send({
    type: "step_progress",
    step,
    partial_output: output,
    ts: Date.now(),
  });
  await sleep(FIELD_REVEAL_INTERVAL_MS);

  send({
    type: "step_complete",
    step,
    output: {
      ...output,
      _meta: {
        from_cache: false,
        duration_ms: meta.duration_ms,
        input_tokens: meta.input_tokens,
        output_tokens: meta.output_tokens,
        cost_usd: meta.cost_usd,
      },
    },
    ts: Date.now(),
  });
}

const HEADLINE_KEYS: Partial<Record<ParentName, string[]>> = {
  "Pricing Agent": [
    "list_price",
    "proposed_price",
    "effective_discount_pct",
    "margin_pct_estimate",
  ],
  "ASC 606 Agent": [
    "performance_obligations",
    "contract_modification_risk",
  ],
  "Redline Agent": ["overall_redline_priority", "one_line_summary"],
  "Approval Agent": ["one_line_summary", "expected_cycle_time_business_days"],
  "Comms Agent": ["customer_email_draft"],
};

interface PersistArgs {
  reviewId: string;
  dealId: string;
  outputs: {
    pricing: unknown;
    asc606: unknown;
    redline: unknown;
    approval: unknown;
    comms: unknown;
  };
  synthesis: string;
  totalRuntimeMs: number;
  totalTokens: number;
  fromCache: boolean;
  customerSignals: unknown;
  similarDeals: unknown;
}

function persistReview({
  reviewId,
  dealId,
  outputs,
  synthesis,
  totalRuntimeMs,
  totalTokens,
  fromCache,
  customerSignals,
  similarDeals,
}: PersistArgs) {
  const db = getDb();

  const insertReview = db.prepare(`
    INSERT INTO deal_reviews (
      id, deal_id, ran_at, ran_by,
      pricing_output_json, asc606_output_json, redline_output_json,
      approval_output_json, comms_output_json,
      similar_deals_json, customer_signals_json,
      synthesis_summary, total_runtime_ms, total_tokens_used,
      is_visitor_submitted
    ) VALUES (
      @id, @deal_id, datetime('now'), @ran_by,
      @pricing_output_json, @asc606_output_json, @redline_output_json,
      @approval_output_json, @comms_output_json,
      @similar_deals_json, @customer_signals_json,
      @synthesis_summary, @total_runtime_ms, @total_tokens_used,
      0
    )
  `);

  const insertAudit = db.prepare(`
    INSERT INTO audit_log (
      id, review_id, step_index, agent_name, step_label,
      input_json, output_json, reasoning_text, tools_called,
      duration_ms, tokens_used, ran_at
    ) VALUES (
      @id, @review_id, @step_index, @agent_name, @step_label,
      @input_json, @output_json, @reasoning_text, @tools_called,
      @duration_ms, @tokens_used, datetime('now')
    )
  `);

  const tx = db.transaction(() => {
    insertReview.run({
      id: reviewId,
      deal_id: dealId,
      ran_by: fromCache ? "cache" : "orchestrator",
      pricing_output_json: JSON.stringify(outputs.pricing),
      asc606_output_json: JSON.stringify(outputs.asc606),
      redline_output_json: JSON.stringify(outputs.redline),
      approval_output_json: JSON.stringify(outputs.approval),
      comms_output_json: JSON.stringify(outputs.comms),
      similar_deals_json: JSON.stringify(similarDeals),
      customer_signals_json: JSON.stringify(customerSignals),
      synthesis_summary: synthesis,
      total_runtime_ms: totalRuntimeMs,
      total_tokens_used: totalTokens || null,
    });

    const agentNames = ["pricing", "asc606", "redline", "approval", "comms"] as const;
    agentNames.forEach((name, i) => {
      insertAudit.run({
        id: `aud_${randomUUID()}`,
        review_id: reviewId,
        step_index: i + 1,
        agent_name: name,
        step_label: `${name[0].toUpperCase() + name.slice(1)} Agent`,
        input_json: JSON.stringify({ deal_id: dealId }),
        output_json: JSON.stringify(outputs[name]),
        reasoning_text:
          (outputs[name] as { reasoning_summary?: string })?.reasoning_summary ??
          "",
        tools_called: JSON.stringify([
          "crm.get_deal",
          ...(name === "pricing" ? ["crm.get_pricing_guardrails"] : []),
          ...(name === "approval" ? ["crm.get_approval_matrix"] : []),
        ]),
        duration_ms: 0,
        tokens_used: null,
      });
    });
  });

  tx();
}
