"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ReasoningStream } from "@/components/reasoning-stream";
import { TimelinePlaceholder } from "./timeline-placeholder";

// Owns the "Run review" CTA + the area beneath it. Stays as the placeholder
// timeline until the user clicks; then mounts <ReasoningStream> which opens an
// SSE connection to /api/run-review/[dealId] and renders live agent state.

export function ReviewRunner({ dealId }: { dealId: string }) {
  const [running, setRunning] = useState(false);

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
        <Button
          onClick={() => setRunning(true)}
          disabled={running}
          className="sm:w-auto"
        >
          {running ? "Running…" : "Run review"}
        </Button>
      </div>
      <div className="mt-4">
        {running ? (
          <ReasoningStream dealId={dealId} />
        ) : (
          <TimelinePlaceholder />
        )}
      </div>
    </section>
  );
}
