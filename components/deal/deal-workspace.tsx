"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import type { DealWithCustomer } from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { ReasoningStream, type StreamPhase } from "@/components/reasoning-stream";
import { TimelinePlaceholder } from "./timeline-placeholder";
import { DealContextRail } from "./deal-context-rail";
import { SimilarDealsPanel } from "@/components/panels/similar-deals-panel";
import { CustomerSignalsPanel } from "@/components/panels/customer-signals-panel";
import type { CustomerSignalsResult } from "@/lib/tools/exa-search";
import type { SimilarDealRecord } from "@/lib/tools/vector-search";
import { cn } from "@/lib/utils";

// The deal-detail page body. Per docs/12-redesign-plan.md §3.4, Mode 1
// (idle + running) is a workbench: deal context + similar deals +
// customer signals on the left, the run CTA + reasoning timeline on
// the right. When the orchestrator's synthesis fires, the layout
// collapses to single-column full-width so <CompletedView> (rendered
// from inside ReasoningStream) gets its full canvas.
//
// This component owns just enough state for the left rail: the panel
// data (similarDeals + customerSignals) mirrored from the SSE stream
// via ReasoningStream's onPanelData callback, and the phase flag the
// stream emits to switch layout. The full agent-output state stays
// inside ReasoningStream to keep the SSE plumbing untouched.

type RunMode = "idle" | "cached" | "live";

export function DealWorkspace({ deal }: { deal: DealWithCustomer }) {
  const search = useSearchParams();
  const showDevTools =
    process.env.NODE_ENV !== "production" && search.get("dev") === "true";

  const [mode, setMode] = useState<RunMode>("idle");
  const running = mode !== "idle";

  const [phase, setPhase] = useState<StreamPhase>("idle");
  const [similarDeals, setSimilarDeals] = useState<SimilarDealRecord[] | null>(
    null,
  );
  const [customerSignals, setCustomerSignals] =
    useState<CustomerSignalsResult | null>(null);

  // Mode 2 collapses the split — the right column already produces a
  // full-width <CompletedView>. The split survives in Mode 1 (idle +
  // running) so the left rail provides operator context while the
  // agents stream.
  const split = phase !== "complete";

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 pt-4 sm:px-6 sm:pt-5">
      <div
        className={cn(
          "grid gap-4 sm:gap-5",
          split ? "grid-cols-1 lg:grid-cols-12" : "grid-cols-1",
        )}
      >
        {split ? (
          <aside
            aria-label="Deal context"
            className="lg:col-span-4 lg:sticky lg:top-3 lg:self-start lg:max-h-[calc(100vh-1.5rem)] lg:overflow-y-auto"
          >
            <div className="space-y-3">
              <DealContextRail deal={deal} />
              {/* Panels stream in once the orchestrator's Step 2
                  fan-out lands. They render skeletons while waiting
                  via their internal `null` empty state. */}
              {(similarDeals !== null || running) && (
                <SimilarDealsPanel deals={similarDeals} />
              )}
              {(customerSignals !== null || running) && (
                <CustomerSignalsPanel result={customerSignals} />
              )}
            </div>
          </aside>
        ) : null}

        <section
          aria-label="Deal review"
          className={cn(split ? "lg:col-span-8" : "")}
        >
          <RunHeader
            running={running}
            mode={mode}
            onCached={() => setMode("cached")}
            onLive={() => setMode("live")}
            showDevTools={showDevTools}
          />
          <div className="mt-3">
            {running ? (
              <ReasoningStream
                dealId={deal.id}
                live={mode === "live"}
                hidePanels
                onPanelData={(panel, data) => {
                  if (panel === "similar_deals") {
                    setSimilarDeals(data as SimilarDealRecord[]);
                  } else {
                    setCustomerSignals(data as CustomerSignalsResult);
                  }
                }}
                onPhaseChange={setPhase}
              />
            ) : (
              <TimelinePlaceholder />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function RunHeader({
  running,
  mode,
  onCached,
  onLive,
  showDevTools,
}: {
  running: boolean;
  mode: RunMode;
  onCached: () => void;
  onLive: () => void;
  showDevTools: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-[13px] font-semibold text-foreground">Review</h2>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          {running
            ? "Agent stream live. Six lanes — orchestrator, pricing, ASC 606, redline, approval, comms — reason in parallel."
            : "Six agents will reason in parallel — context, pricing, ASC 606, redlines, approvals, and comms."}
        </p>
      </div>
      <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
        <div className="flex gap-2">
          {showDevTools && (
            <Button
              variant="outline"
              onClick={onLive}
              disabled={running}
              className="sm:w-auto"
            >
              {mode === "live" ? "Streaming…" : "Re-run live"}
            </Button>
          )}
          <Button
            onClick={onCached}
            disabled={running}
            className="sm:w-auto"
          >
            {mode === "cached" ? "Running…" : "Run review"}
          </Button>
        </div>
        {showDevTools && (
          <p className="max-w-xs text-right text-[10.5px] leading-snug text-muted-foreground">
            Re-runs may produce slightly different output (the agents are
            non-deterministic).
          </p>
        )}
      </div>
    </div>
  );
}
