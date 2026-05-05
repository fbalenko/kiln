"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  ListChecks,
  Loader2,
  Search,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AgentOutputCard } from "@/components/agent-output-card";
import { cn } from "@/lib/utils";

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

// The canonical sub-stage sequence the Pricing Agent walks through. The
// server emits substep events with these `id`s; pending entries render with
// the static label below until a server event flips them to running/complete.
const PRICING_SUBSTEPS: Array<{
  id: string;
  defaultLabel: string;
  icon: LucideIcon;
}> = [
  { id: "fetch_deal", defaultLabel: "Fetch deal record from CRM", icon: Database },
  { id: "load_guardrails", defaultLabel: "Load active pricing guardrails", icon: Shield },
  { id: "similar_deals", defaultLabel: "Identify similar past deals", icon: Search },
  { id: "reasoning", defaultLabel: "Reason about pricing economics", icon: Brain },
  { id: "guardrail_eval", defaultLabel: "Evaluate guardrails", icon: ListChecks },
  { id: "alternatives", defaultLabel: "Generate alternative structures", icon: Sparkles },
  { id: "margin_sensitivity", defaultLabel: "Compute margin sensitivity", icon: TrendingUp },
  { id: "finalizing", defaultLabel: "Finalize recommendation", icon: Target },
];

const SUBSTEP_PLANS: Record<string, typeof PRICING_SUBSTEPS> = {
  "Pricing Agent": PRICING_SUBSTEPS,
};

type Status = "pending" | "running" | "complete" | "error" | "skipped";

interface SubstepState {
  status: "pending" | "running" | "complete";
  label: string;
  startedAt?: number;
  completedAt?: number;
}

interface StepState {
  status: Status;
  startedAt?: number;
  completedAt?: number;
  partialOutput?: unknown;
  finalOutput?: unknown;
  errorMessage?: string;
  substeps: Record<string, SubstepState>;
}

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

function initialSteps(): Record<string, StepState> {
  const init: Record<string, StepState> = {};
  STEP_PLAN.forEach((s) => {
    init[s.id] = { status: "pending", substeps: {} };
  });
  return init;
}

export function ReasoningStream({
  dealId,
  live = false,
}: {
  dealId: string;
  live?: boolean;
}) {
  const [steps, setSteps] = useState<Record<string, StepState>>(initialSteps);
  const [synthesis, setSynthesis] = useState<{
    summary: string;
    reviewId: string;
  } | null>(null);
  const [done, setDone] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const url = live
      ? `/api/run-review/${dealId}?live=1`
      : `/api/run-review/${dealId}`;
    const es = new EventSource(url);
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
            [ev.step]: {
              ...prev[ev.step],
              status: "running",
              startedAt: ev.ts,
            },
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
              completedAt: ev.ts,
              finalOutput: ev.output,
              partialOutput: ev.output,
            },
          }));
          break;
        }
        case "substep": {
          setSteps((prev) => {
            const parent = prev[ev.parent] ?? {
              status: "running" as Status,
              substeps: {},
            };
            const existing = parent.substeps[ev.id];
            const nextSub: SubstepState = {
              status: ev.status,
              label: ev.label,
              startedAt:
                existing?.startedAt ??
                (ev.status === "running" ? ev.ts : undefined),
              completedAt:
                ev.status === "complete" ? ev.ts : existing?.completedAt,
            };
            return {
              ...prev,
              [ev.parent]: {
                ...parent,
                substeps: { ...parent.substeps, [ev.id]: nextSub },
              },
            };
          });
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
                next[key] = { ...next[key], status: "skipped" };
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
  }, [dealId, live]);

  return (
    <ol className="relative space-y-2.5 border-l border-border pl-6 sm:pl-8">
      {STEP_PLAN.map((step, i) => {
        const state = steps[step.id];
        const isPricing = step.id === "Pricing Agent";
        const substepPlan = SUBSTEP_PLANS[step.id];
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

              {/* Sub-stage timeline shows up while the parent is running OR
                  after it completes (collapsed by default once done). */}
              {substepPlan &&
                (state.status === "running" || state.status === "complete") && (
                  <SubstepList
                    plan={substepPlan}
                    state={state}
                    parentStatus={state.status}
                  />
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

function SubstepList({
  plan,
  state,
  parentStatus,
}: {
  plan: typeof PRICING_SUBSTEPS;
  state: StepState;
  parentStatus: Status;
}) {
  // While the parent step is running, the sub-stage list is always expanded so
  // the user can watch progression. Once the parent completes it auto-collapses
  // to a one-line summary; clicking the chevron re-opens it for review.
  const [expanded, setExpanded] = useState(false);
  const effectiveOpen = parentStatus === "running" ? true : expanded;

  const counts = useMemo(
    () => summarize(plan, state.substeps),
    [plan, state.substeps],
  );
  const elapsedMs =
    state.completedAt && state.startedAt
      ? state.completedAt - state.startedAt
      : null;

  return (
    <div className="border-t border-border">
      {parentStatus === "complete" && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-[11px] text-muted-foreground transition hover:bg-surface-hover sm:px-4"
        >
          <span className="inline-flex items-center gap-1.5">
            {effectiveOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>
              Done{elapsedMs ? ` in ${(elapsedMs / 1000).toFixed(1)}s` : ""} ·{" "}
              {counts.complete} of {counts.total} sub-stages
            </span>
          </span>
        </button>
      )}
      {(parentStatus === "running" || effectiveOpen) && (
        <ul className="space-y-0.5 px-3.5 py-2 sm:px-4">
          {plan.map((p) => {
            const sub = state.substeps[p.id];
            const status = sub?.status ?? "pending";
            const Icon = p.icon;
            return (
              <li
                key={p.id}
                className={cn(
                  "flex items-center gap-2 rounded px-1.5 py-1 text-[12px] leading-tight transition-colors",
                  status === "running" &&
                    "bg-[var(--brand)]/[0.06] text-foreground",
                  status === "complete" && "text-muted-foreground",
                  status === "pending" && "text-foreground/35",
                )}
              >
                <SubstepGlyph status={status} icon={Icon} />
                <span className="min-w-0 flex-1 truncate">
                  {sub?.label ?? p.defaultLabel}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function summarize(
  plan: typeof PRICING_SUBSTEPS,
  substeps: Record<string, SubstepState>,
): { complete: number; total: number } {
  return {
    total: plan.length,
    complete: plan.filter((p) => substeps[p.id]?.status === "complete").length,
  };
}

function SubstepGlyph({
  status,
  icon: Icon,
}: {
  status: "pending" | "running" | "complete";
  icon: LucideIcon;
}) {
  if (status === "complete") {
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/15 text-[var(--brand)]">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      </span>
    );
  }
  // pending — show the topical icon faintly so the user has a hint of what's coming
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-foreground/30">
      <Icon className="h-3 w-3" strokeWidth={1.5} />
    </span>
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

