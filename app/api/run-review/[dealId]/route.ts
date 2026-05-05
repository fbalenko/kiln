import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { runPricingAgent } from "@/lib/agents/pricing-agent";
import { getDb } from "@/lib/db/client";
import { getDealById } from "@/lib/db/queries";
import type { PricingOutput } from "@/lib/agents/schemas";

// SSE endpoint for the Phase 3 single-agent review.
//
// Stream contract (docs/03-agents.md §Streaming contract):
//   step_start | step_progress | step_complete | synthesis | error
//
// Phase 3 emits exactly one real agent step (Pricing) plus a token "Gather
// context" step for visual continuity. Phase 4 will fan this out to all five
// sub-agents through the orchestrator.
//
// Partial-output reveal: the Pricing Agent returns the entire JSON in one shot
// (we ask the model for a single object, not a stream of fields). We synthesize
// the field-by-field reveal here so the UI's <ReasoningStream> sees the same
// shape it will see from the future real-streaming orchestrator.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ dealId: string }>;
}

const FIELD_REVEAL_INTERVAL_MS = 140;

type StreamEvent =
  | { type: "step_start"; step: string; agent: string | null; ts: number }
  | { type: "step_progress"; step: string; partial_output: unknown; ts: number }
  | { type: "step_complete"; step: string; output: unknown; ts: number }
  | {
      type: "substep";
      parent: string;
      id: string;
      label: string;
      status: "running" | "complete";
      ts: number;
    }
  | { type: "synthesis"; summary: string; review_id: string; ts: number }
  | { type: "error"; step: string; message: string; ts: number };

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
      // React 19 strict mode (and short-lived SSE clients like our Puppeteer
      // smoke test) can disconnect mid-stream while we're still sleeping
      // between field-reveal slices. After that, controller.enqueue throws
      // ERR_INVALID_STATE — swallow it instead of letting the catch block
      // try to emit a downstream `error` event on the same dead controller.
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

      try {
        // ---- Step 1: Gather context (synthetic, instant) ----
        const ctxLabel = "Gather context";
        send({
          type: "step_start",
          step: ctxLabel,
          agent: null,
          ts: Date.now(),
        });
        // Tiny breath so the UI gets a paint between start and complete.
        await sleep(120);
        send({
          type: "step_complete",
          step: ctxLabel,
          output: {
            deal_id: deal.id,
            customer: deal.customer.name,
            segment: deal.customer.segment,
            similar_deals_loaded: 0,
            customer_signals_loaded: 0,
            note: "Vector search + Exa land in Phase 5. Phase 3 runs the Pricing Agent against guardrails only.",
          },
          ts: Date.now(),
        });

        // ---- Step 2: Pricing Agent ----
        const pricingLabel = "Pricing Agent";
        const pricingStart = Date.now();
        send({
          type: "step_start",
          step: pricingLabel,
          agent: "pricing",
          ts: pricingStart,
        });

        const result = await runPricingAgent(dealId, {
          forceRefresh,
          onSubstep: (e) => {
            send({
              type: "substep",
              parent: pricingLabel,
              id: e.id,
              label: e.label,
              status: e.status,
              ts: Date.now(),
            });
          },
        });

        // Field-by-field reveal of the structured output. Spec: progressive
        // partials, NOT raw token streaming. Order chosen to mirror how a
        // human pricing analyst would talk through the deal — headline numbers
        // first, then guardrails, then alternatives, then context.
        await emitFieldReveal(send, pricingLabel, result.output);

        send({
          type: "step_complete",
          step: pricingLabel,
          output: {
            ...result.output,
            _meta: {
              from_cache: result.fromCache,
              duration_ms: result.durationMs,
              input_tokens: result.inputTokens,
              output_tokens: result.outputTokens,
            },
          },
          ts: Date.now(),
        });

        // ---- Persist review + audit log ----
        const reviewId = `rev_${randomUUID()}`;
        const totalRuntimeMs = Date.now() - pricingStart;
        const totalTokens =
          (result.inputTokens ?? 0) + (result.outputTokens ?? 0);
        persistReview({
          reviewId,
          dealId,
          pricingOutput: result.output,
          totalRuntimeMs,
          totalTokens,
          fromCache: result.fromCache,
        });

        // ---- Synthesis ----
        send({
          type: "synthesis",
          summary: result.output.reasoning_summary,
          review_id: reviewId,
          ts: Date.now(),
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown agent error";
        console.error("[run-review] Pricing Agent failed:", err);
        send({
          type: "error",
          step: "Pricing Agent",
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

async function emitFieldReveal(
  send: (e: StreamEvent) => void,
  step: string,
  output: PricingOutput,
) {
  const sleep = (ms: number) =>
    new Promise<void>((res) => setTimeout(res, ms));

  // Slice 1: headline pricing numbers.
  send({
    type: "step_progress",
    step,
    partial_output: {
      list_price: output.list_price,
      proposed_price: output.proposed_price,
      effective_discount_pct: output.effective_discount_pct,
      margin_pct_estimate: output.margin_pct_estimate,
    },
    ts: Date.now(),
  });
  await sleep(FIELD_REVEAL_INTERVAL_MS);

  // Slice 2: + guardrail evaluations.
  send({
    type: "step_progress",
    step,
    partial_output: {
      list_price: output.list_price,
      proposed_price: output.proposed_price,
      effective_discount_pct: output.effective_discount_pct,
      margin_pct_estimate: output.margin_pct_estimate,
      guardrail_evaluations: output.guardrail_evaluations,
    },
    ts: Date.now(),
  });
  await sleep(FIELD_REVEAL_INTERVAL_MS);

  // Slice 3: + alternative structures.
  send({
    type: "step_progress",
    step,
    partial_output: {
      list_price: output.list_price,
      proposed_price: output.proposed_price,
      effective_discount_pct: output.effective_discount_pct,
      margin_pct_estimate: output.margin_pct_estimate,
      guardrail_evaluations: output.guardrail_evaluations,
      alternative_structures: output.alternative_structures,
    },
    ts: Date.now(),
  });
  await sleep(FIELD_REVEAL_INTERVAL_MS);

  // (step_complete carries the rest — confidence, references, summary.)
}

interface PersistArgs {
  reviewId: string;
  dealId: string;
  pricingOutput: PricingOutput;
  totalRuntimeMs: number;
  totalTokens: number;
  fromCache: boolean;
}

function persistReview({
  reviewId,
  dealId,
  pricingOutput,
  totalRuntimeMs,
  totalTokens,
  fromCache,
}: PersistArgs) {
  const db = getDb();
  const PHASE3_PLACEHOLDER = "{}";

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
      ran_by: fromCache ? "cache" : "pricing-agent",
      pricing_output_json: JSON.stringify(pricingOutput),
      asc606_output_json: PHASE3_PLACEHOLDER,
      redline_output_json: PHASE3_PLACEHOLDER,
      approval_output_json: PHASE3_PLACEHOLDER,
      comms_output_json: PHASE3_PLACEHOLDER,
      similar_deals_json: "[]",
      customer_signals_json: "{}",
      synthesis_summary: pricingOutput.reasoning_summary,
      total_runtime_ms: totalRuntimeMs,
      total_tokens_used: totalTokens || null,
    });

    insertAudit.run({
      id: `aud_${randomUUID()}`,
      review_id: reviewId,
      step_index: 1,
      agent_name: "pricing",
      step_label: "Pricing Agent",
      input_json: JSON.stringify({ deal_id: dealId }),
      output_json: JSON.stringify(pricingOutput),
      reasoning_text: pricingOutput.reasoning_summary,
      tools_called: JSON.stringify(["crm.get_deal", "crm.get_pricing_guardrails"]),
      duration_ms: totalRuntimeMs,
      tokens_used: totalTokens || null,
    });
  });

  tx();
}
