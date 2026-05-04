"use client";

import { useEffect, useRef, useState } from "react";
import { AgentOutputCard } from "@/components/agent-output-card";
import { cn } from "@/lib/utils";
import { AlertCircle, Check, Loader2 } from "lucide-react";

// Live timeline that subscribes to /api/run-review/[dealId] over SSE.
// Mirrors the 6-step orchestrator plan from docs/03-agents.md so the visual
// shape stays stable when Phase 4 wires the remaining four sub-agents.

const STEP_PLAN: Array<{ id: string; label: string; note: string }> = [
  {
    id: "Gather context",
    label: "Gather context",
    note: "CRM record, customer signals (Exa), top-3 similar past deals",
  },
  {
    id: "Pricing Agent",
    label: "Pricing Agent",
    note: "Effective discount, margin, guardrail evaluation, alternative structures",
  },
  {
    id: "ASC 606 Agent",
    label: "ASC 606 Agent",
    note: "Performance obligations, variable consideration, recognition schedule",
  },
  {
    id: "Redline Agent",
    label: "Redline Agent",
    note: "Non-standard clauses, suggested counters, fallback positions",
  },
  {
    id: "Approval Agent",
    label: "Approval Agent",
    note: "Required approver path per the active matrix",
  },
  {
    id: "Comms Agent",
    label: "Comms Agent",
    note: "Slack post, AE email, customer reply draft",
  },
];

type Status = "pending" | "running" | "complete" | "error" | "skipped";

interface StepState {
  status: Status;
  partialOutput?: unknown;
  finalOutput?: unknown;
  errorMessage?: string;
}

type StreamEvent =
  | { type: "step_start"; step: string; agent: string | null; ts: number }
  | { type: "step_progress"; step: string; partial_output: unknown; ts: number }
  | { type: "step_complete"; step: string; output: unknown; ts: number }
  | { type: "synthesis"; summary: string; review_id: string; ts: number }
  | { type: "error"; step: string; message: string; ts: number };

function initialSteps(): Record<string, StepState> {
  const init: Record<string, StepState> = {};
  STEP_PLAN.forEach((s) => {
    init[s.id] = { status: "pending" };
  });
  return init;
}

export function ReasoningStream({ dealId }: { dealId: string }) {
  const [steps, setSteps] = useState<Record<string, StepState>>(initialSteps);
  const [synthesis, setSynthesis] = useState<{
    summary: string;
    reviewId: string;
  } | null>(null);
  const [done, setDone] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/run-review/${dealId}`);
    esRef.current = es;

    es.onmessage = (msg) => {
      let ev: StreamEvent;
      try {
        ev = JSON.parse(msg.data) as StreamEvent;
      } catch {
        return;
      }

      switch (ev.type) {
        case "step_start": {
          setSteps((prev) => ({
            ...prev,
            [ev.step]: { ...prev[ev.step], status: "running" },
          }));
          break;
        }
        case "step_progress": {
          setSteps((prev) => ({
            ...prev,
            [ev.step]: {
              ...prev[ev.step],
              status: "running",
              partialOutput: ev.partial_output,
            },
          }));
          break;
        }
        case "step_complete": {
          setSteps((prev) => ({
            ...prev,
            [ev.step]: {
              ...prev[ev.step],
              status: "complete",
              finalOutput: ev.output,
              partialOutput: ev.output,
            },
          }));
          break;
        }
        case "synthesis": {
          setSynthesis({ summary: ev.summary, reviewId: ev.review_id });
          // Phase 3 doesn't run the remaining 4 agents — mark them as
          // "skipped" so they don't sit forever in pending state.
          setSteps((prev) => {
            const next = { ...prev };
            for (const key of [
              "ASC 606 Agent",
              "Redline Agent",
              "Approval Agent",
              "Comms Agent",
            ]) {
              if (next[key]?.status === "pending") {
                next[key] = { status: "skipped" };
              }
            }
            return next;
          });
          setDone(true);
          es.close();
          break;
        }
        case "error": {
          setSteps((prev) => ({
            ...prev,
            [ev.step]: {
              ...prev[ev.step],
              status: "error",
              errorMessage: ev.message,
            },
          }));
          setDone(true);
          es.close();
          break;
        }
      }
    };

    es.onerror = () => {
      // SSE close after final event also fires onerror; only flip the UI when
      // we haven't already finished cleanly.
      if (esRef.current && esRef.current.readyState === EventSource.CLOSED) {
        return;
      }
      setDone(true);
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [dealId]);

  return (
    <ol className="relative space-y-2.5 border-l border-border pl-6 sm:pl-8">
      {STEP_PLAN.map((step, i) => {
        const state = steps[step.id];
        const isPricing = step.id === "Pricing Agent";
        return (
          <li key={step.id} className="relative">
            <StepDot index={i + 1} status={state.status} />
            <div
              className={cn(
                "rounded-md border bg-card transition-colors",
                state.status === "running" && "border-[var(--brand)]/40 bg-[var(--brand)]/[0.03]",
                state.status === "complete" && "border-border",
                state.status === "error" && "border-red-300 bg-red-50/50 dark:bg-red-900/10",
                state.status === "pending" && "border-border opacity-70",
                state.status === "skipped" && "border-dashed border-border opacity-50",
              )}
            >
              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 sm:px-4 sm:py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {step.label}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {step.note}
                  </div>
                </div>
                <StatusLabel status={state.status} />
              </div>

              {state.status === "error" && state.errorMessage && (
                <div className="border-t border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300 sm:px-4">
                  {state.errorMessage}
                </div>
              )}

              {/* Pricing payload renders inline beneath the step card as the
                  output streams in. The other steps stay headers-only in
                  Phase 3. */}
              {isPricing &&
                state.partialOutput !== undefined &&
                (state.status === "running" ||
                  state.status === "complete") && (
                  <div className="border-t border-border p-3 sm:p-4">
                    <AgentOutputCard
                      output={state.partialOutput as Parameters<typeof AgentOutputCard>[0]["output"]}
                    />
                  </div>
                )}
            </div>
          </li>
        );
      })}

      {synthesis && (
        <li className="relative pt-1">
          <span
            aria-hidden
            className="absolute -left-[26px] top-3 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--brand)] text-white sm:-left-[34px]"
          >
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
          <div className="rounded-md border border-[var(--brand)]/30 bg-[var(--brand)]/[0.04] p-3.5 sm:p-4 animate-in fade-in slide-in-from-bottom-1 duration-300">
            <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--brand)]">
              Synthesis
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-foreground">
              {synthesis.summary}
            </p>
            <div className="mt-2 font-mono text-[10px] text-muted-foreground">
              review {synthesis.reviewId}
            </div>
          </div>
        </li>
      )}

      {done && !synthesis && (
        <li className="text-xs text-muted-foreground">Stream ended.</li>
      )}
    </ol>
  );
}

function StepDot({ index, status }: { index: number; status: Status }) {
  const base =
    "absolute -left-[26px] top-3 inline-flex h-4 w-4 items-center justify-center rounded-full font-mono text-[10px] sm:-left-[34px]";
  if (status === "running") {
    return (
      <span
        aria-hidden
        className={cn(base, "border border-[var(--brand)] bg-[var(--brand)] text-white")}
      >
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      </span>
    );
  }
  if (status === "complete") {
    return (
      <span
        aria-hidden
        className={cn(base, "border border-[var(--brand)] bg-[var(--brand)] text-white")}
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        aria-hidden
        className={cn(base, "border border-red-300 bg-red-50 text-red-700")}
      >
        <AlertCircle className="h-2.5 w-2.5" />
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span
        aria-hidden
        className={cn(
          base,
          "border border-dashed border-border bg-background text-muted-foreground",
        )}
      >
        {index}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(base, "border border-border bg-background text-muted-foreground")}
    >
      {index}
    </span>
  );
}

function StatusLabel({ status }: { status: Status }) {
  const map: Record<Status, { text: string; className: string }> = {
    pending: {
      text: "Pending",
      className: "text-muted-foreground",
    },
    running: {
      text: "Running",
      className: "text-[var(--brand)]",
    },
    complete: {
      text: "Complete",
      className: "text-emerald-700 dark:text-emerald-400",
    },
    error: {
      text: "Error",
      className: "text-red-700 dark:text-red-400",
    },
    skipped: {
      text: "Phase 4",
      className: "text-muted-foreground",
    },
  };
  const { text, className } = map[status];
  return (
    <span
      className={cn(
        "shrink-0 text-[10px] uppercase tracking-wider",
        className,
      )}
    >
      {text}
    </span>
  );
}
