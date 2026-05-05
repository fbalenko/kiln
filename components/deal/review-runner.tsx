"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ReasoningStream } from "@/components/reasoning-stream";
import { TimelinePlaceholder } from "./timeline-placeholder";

// Owns the "Run review" CTA + the area beneath it. Stays as the placeholder
// timeline until the user clicks; then mounts <ReasoningStream> which opens an
// SSE connection to /api/run-review/[dealId] and renders live agent state.
//
// Two entry points (only the second is publicly visible):
//   • "Run review"   — uses the cache when present. Cached scenarios paced-
//                       replay their original substep tape so the visitor
//                       sees a streaming run, not an instant flash.
//   • "Re-run live"  — appends ?live=1 to bypass the cache. Always streams
//                       end-to-end and rewrites the cache on success.
//                       Hidden by default; surfaces only when the URL has
//                       ?dev=true AND we're not in a production build.

type RunMode = "idle" | "cached" | "live";

export function ReviewRunner({ dealId }: { dealId: string }) {
  const search = useSearchParams();
  const showDevTools =
    process.env.NODE_ENV !== "production" && search.get("dev") === "true";

  const [mode, setMode] = useState<RunMode>("idle");
  const running = mode !== "idle";

  return (
    <section className="mt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Review</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {running
              ? "Agent stream live. Phase 3 runs the Pricing Agent end-to-end; the other four steps land in Phase 4."
              : "Six agents will reason in sequence — context, pricing, ASC 606, redlines, approvals, and comms."}
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
          <div className="flex gap-2">
            {showDevTools && (
              <Button
                variant="outline"
                onClick={() => setMode("live")}
                disabled={running}
                className="sm:w-auto"
              >
                {mode === "live" ? "Streaming…" : "Re-run live"}
              </Button>
            )}
            <Button
              onClick={() => setMode("cached")}
              disabled={running}
              className="sm:w-auto"
            >
              {mode === "cached" ? "Running…" : "Run review"}
            </Button>
          </div>
          {showDevTools && (
            <p className="max-w-xs text-right text-[11px] leading-snug text-muted-foreground">
              Re-runs may produce slightly different output (the agents are
              non-deterministic).
            </p>
          )}
        </div>
      </div>
      <div className="mt-4">
        {running ? (
          <ReasoningStream dealId={dealId} live={mode === "live"} />
        ) : (
          <TimelinePlaceholder />
        )}
      </div>
    </section>
  );
}
