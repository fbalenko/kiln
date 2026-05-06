"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Network } from "lucide-react";

// The collapsed reasoning-trace summary that replaces the dominant Mode 1
// timeline once the synthesis arrives. Click to expand inline; the timeline
// itself is rendered as `children` and slides in below the summary line.

interface Props {
  totalElapsedMs: number | null;
  substepCount: number;
  agentCount: number;
  children: React.ReactNode;
}

export function TimelineSummary({
  totalElapsedMs,
  substepCount,
  agentCount,
  children,
}: Props) {
  const [open, setOpen] = useState(false);

  const elapsedLabel =
    totalElapsedMs && totalElapsedMs > 0
      ? `Done in ${(totalElapsedMs / 1000).toFixed(1)}s`
      : "Done";

  return (
    <section className="rounded-md border border-border bg-card animate-in fade-in duration-300">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-surface-hover"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
            <Network className="h-3 w-3" />
          </span>
          <span className="text-[13px] font-medium text-foreground">
            View reasoning trace
          </span>
          <span className="hidden text-[12px] text-muted-foreground sm:inline">
            ·
          </span>
          <span className="hidden font-mono text-[11px] text-muted-foreground tabular-nums sm:inline">
            {elapsedLabel}
          </span>
          <span className="hidden text-[12px] text-muted-foreground sm:inline">
            ·
          </span>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            {agentCount} agents
          </span>
          <span className="hidden text-[12px] text-muted-foreground sm:inline">
            ·
          </span>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            {substepCount} substeps
          </span>
        </div>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="border-t border-border p-3 sm:p-4 animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </section>
  );
}
