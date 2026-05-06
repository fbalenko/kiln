"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Brain,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  FileText,
  Flag,
  GitBranch,
  Hourglass,
  Layers,
  ListChecks,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Network,
  PenTool,
  Search,
  Send,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AgentOutputCard } from "@/components/agent-output-card";
import { Asc606Card } from "@/components/agent-cards/asc606-card";
import { ApprovalCard } from "@/components/agent-cards/approval-card";
import { CommsCard } from "@/components/agent-cards/comms-card";
import { RedlineCard } from "@/components/agent-cards/redline-card";
import { CustomerSignalsPanel } from "@/components/panels/customer-signals-panel";
import { SimilarDealsPanel } from "@/components/panels/similar-deals-panel";
import { ArtifactsPanel } from "@/components/artifacts-panel";
import type { CustomerSignalsResult } from "@/lib/tools/exa-search";
import type { SimilarDealRecord } from "@/lib/tools/vector-search";
import type { SlackPostRecord } from "@/lib/tools/slack";
import type { SlackPostUiState } from "@/components/slack-post-status";
import { cn } from "@/lib/utils";

// Live timeline that subscribes to /api/run-review/[dealId] over SSE.
// Phase 4: shows the orchestrator card on top, then a parallel grid for the
// three fan-out agents (Pricing | ASC 606 | Redline), then sequential
// Approval and Comms cards, then the synthesis card.

const PARENTS = [
  "Orchestrator",
  "Pricing Agent",
  "ASC 606 Agent",
  "Redline Agent",
  "Approval Agent",
  "Comms Agent",
] as const;
export type ParentName = (typeof PARENTS)[number];

type Status = "pending" | "running" | "complete" | "error";

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
  | {
      type: "panel_data";
      panel: "similar_deals" | "customer_signals";
      data: unknown;
      ts: number;
    }
  | { type: "slack_post"; record: SlackPostRecord; ts: number }
  | { type: "synthesis"; summary: string; review_id: string; ts: number }
  | { type: "error"; step: ParentName; message: string; ts: number };

interface SubstepPlan {
  id: string;
  defaultLabel: string;
  icon: LucideIcon;
}

const ORCHESTRATOR_SUBSTEPS: SubstepPlan[] = [
  { id: "fetch_deal", defaultLabel: "Fetch deal record and customer", icon: Database },
  { id: "step2_fanout", defaultLabel: "Fan out: customer signals + similar deals", icon: GitBranch },
  { id: "step2_signals", defaultLabel: "Query Exa for recent customer signals", icon: Search },
  { id: "step2_similar", defaultLabel: "Run k-NN over deal embeddings (sqlite-vec)", icon: Network },
  { id: "step3_dispatch", defaultLabel: "Dispatch parallel review (Pricing + ASC 606 + Redline)", icon: Layers },
  { id: "step3_await", defaultLabel: "Await parallel review completion", icon: Hourglass },
  { id: "step4_routing", defaultLabel: "Route approvals based on upstream outputs", icon: Network },
  { id: "step5_comms", defaultLabel: "Generate communications", icon: MessageCircle },
  { id: "step6_synthesis", defaultLabel: "Synthesize executive summary", icon: Sparkles },
];

const PRICING_SUBSTEPS: SubstepPlan[] = [
  { id: "fetch_deal", defaultLabel: "Fetch deal record from CRM", icon: Database },
  { id: "load_guardrails", defaultLabel: "Load active pricing guardrails", icon: Shield },
  { id: "similar_deals", defaultLabel: "Identify similar past deals", icon: Search },
  { id: "reasoning", defaultLabel: "Reason about pricing economics", icon: Brain },
  { id: "guardrail_eval", defaultLabel: "Evaluate guardrails", icon: ListChecks },
  { id: "alternatives", defaultLabel: "Generate alternative structures", icon: Sparkles },
  { id: "margin_sensitivity", defaultLabel: "Compute margin sensitivity", icon: TrendingUp },
  { id: "finalizing", defaultLabel: "Finalize recommendation", icon: Target },
];

const ASC606_SUBSTEPS: SubstepPlan[] = [
  { id: "identify_obligations", defaultLabel: "Identify performance obligations", icon: Database },
  { id: "evaluate_distinctness", defaultLabel: "Evaluate distinctness for each obligation", icon: ListChecks },
  { id: "analyze_variable_consideration", defaultLabel: "Analyze variable consideration", icon: Activity },
  { id: "assess_modification_risk", defaultLabel: "Assess contract modification risk", icon: AlertTriangle },
  { id: "compute_recognition_schedule", defaultLabel: "Compute revenue recognition schedule", icon: Calendar },
  { id: "flag_red_flags", defaultLabel: "Flag red flags", icon: Flag },
  { id: "finalizing", defaultLabel: "Finalize recognition recommendation", icon: Target },
];

const REDLINE_SUBSTEPS: SubstepPlan[] = [
  { id: "load_context", defaultLabel: "Load deal context and customer signals", icon: Database },
  { id: "scan_clauses", defaultLabel: "Scan non-standard clauses", icon: Search },
  { id: "analyze_clauses", defaultLabel: "Analyze flagged clauses", icon: FileText },
  { id: "draft_counters", defaultLabel: "Draft counter-positions", icon: PenTool },
  { id: "draft_fallbacks", defaultLabel: "Draft fallback positions", icon: Shield },
  { id: "cross_reference_signals", defaultLabel: "Cross-reference customer signals", icon: TrendingUp },
  { id: "finalizing", defaultLabel: "Finalize redline recommendations", icon: Target },
];

const APPROVAL_SUBSTEPS: SubstepPlan[] = [
  { id: "load_matrix", defaultLabel: "Load active approval matrix", icon: Shield },
  { id: "evaluate_rules", defaultLabel: "Evaluate each matrix rule", icon: ListChecks },
  { id: "identify_triggered", defaultLabel: "Identify triggered rules", icon: Flag },
  { id: "build_chain", defaultLabel: "Build approval chain", icon: Network },
  { id: "compute_cycle_time", defaultLabel: "Compute expected cycle time", icon: Clock },
  { id: "finalizing", defaultLabel: "Finalize routing decision", icon: Target },
];

const COMMS_SUBSTEPS: SubstepPlan[] = [
  { id: "analyze_context", defaultLabel: "Analyze deal context and tone requirements", icon: Database },
  { id: "draft_slack_post", defaultLabel: "Draft Slack post for #deal-desk", icon: MessageSquare },
  { id: "draft_ae_email", defaultLabel: "Draft AE email with action items", icon: Mail },
  { id: "draft_customer_email", defaultLabel: "Draft customer reply with counter-positions", icon: Send },
  { id: "build_one_pager", defaultLabel: "Build approval review one-pager", icon: FileText },
  { id: "finalizing", defaultLabel: "Finalize communication artifacts", icon: Target },
];

const SUBSTEP_PLANS: Record<ParentName, SubstepPlan[]> = {
  Orchestrator: ORCHESTRATOR_SUBSTEPS,
  "Pricing Agent": PRICING_SUBSTEPS,
  "ASC 606 Agent": ASC606_SUBSTEPS,
  "Redline Agent": REDLINE_SUBSTEPS,
  "Approval Agent": APPROVAL_SUBSTEPS,
  "Comms Agent": COMMS_SUBSTEPS,
};

const STEP_NOTES: Record<ParentName, string> = {
  Orchestrator: "Coordinates the pipeline: fetch context → parallel review → approval → comms → synthesis",
  "Pricing Agent": "Effective discount, margin, guardrail evaluation, alternative structures",
  "ASC 606 Agent": "Performance obligations, variable consideration, recognition schedule",
  "Redline Agent": "Non-standard clauses, suggested counters, fallback positions",
  "Approval Agent": "Required approver path per the active matrix",
  "Comms Agent": "Slack post, AE email, customer reply draft, approval one-pager",
};

function initialSteps(): Record<ParentName, StepState> {
  const init = {} as Record<ParentName, StepState>;
  for (const p of PARENTS) {
    init[p] = { status: "pending", substeps: {} };
  }
  return init;
}

export function ReasoningStream({
  dealId,
  live = false,
}: {
  dealId: string;
  live?: boolean;
}) {
  const [steps, setSteps] = useState<Record<ParentName, StepState>>(
    initialSteps,
  );
  const [synthesis, setSynthesis] = useState<{
    summary: string;
    reviewId: string;
  } | null>(null);
  const [similarDeals, setSimilarDeals] = useState<SimilarDealRecord[] | null>(
    null,
  );
  const [customerSignals, setCustomerSignals] =
    useState<CustomerSignalsResult | null>(null);
  const [slackPost, setSlackPost] = useState<SlackPostUiState | null>(null);
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
                status:
                  parent.status === "pending" ? "running" : parent.status,
                substeps: { ...parent.substeps, [ev.id]: nextSub },
              },
            };
          });
          // Surface a "pending" Slack indicator the moment the orchestrator
          // dispatches the post — the slack_post settlement event arrives a
          // few seconds later (or near-instantly on cache replay).
          if (
            ev.parent === "Orchestrator" &&
            ev.id === "step6_slack_post" &&
            ev.status === "running"
          ) {
            setSlackPost({ phase: "pending" });
          }
          break;
        }
        case "panel_data": {
          if (ev.panel === "similar_deals") {
            setSimilarDeals(ev.data as SimilarDealRecord[]);
          } else if (ev.panel === "customer_signals") {
            setCustomerSignals(ev.data as CustomerSignalsResult);
          }
          break;
        }
        case "slack_post": {
          setSlackPost({ phase: "settled", record: ev.record });
          break;
        }
        case "synthesis": {
          setSynthesis({ summary: ev.summary, reviewId: ev.review_id });
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
      {/* 1. Orchestrator */}
      <TimelineRow
        index={1}
        parent="Orchestrator"
        state={steps.Orchestrator}
      />

      {/* 2. Parallel grid: Pricing | ASC 606 | Redline. The three cards
          mount inside a single timeline row so the visitor sees them
          spinning simultaneously — "wow, it's actually multi-agent." */}
      <li className="relative">
        <ParallelGroupDot
          status={collapseStatuses([
            steps["Pricing Agent"].status,
            steps["ASC 606 Agent"].status,
            steps["Redline Agent"].status,
          ])}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <ParallelAgentCard
            parent="Pricing Agent"
            state={steps["Pricing Agent"]}
          />
          <ParallelAgentCard
            parent="ASC 606 Agent"
            state={steps["ASC 606 Agent"]}
          />
          <ParallelAgentCard
            parent="Redline Agent"
            state={steps["Redline Agent"]}
          />
        </div>
      </li>

      {/* 3. Approval — sequential after the parallel block */}
      <TimelineRow
        index={3}
        parent="Approval Agent"
        state={steps["Approval Agent"]}
      />

      {/* 4. Comms — sequential after Approval */}
      <TimelineRow
        index={4}
        parent="Comms Agent"
        state={steps["Comms Agent"]}
        slackPost={slackPost}
        reviewId={synthesis?.reviewId ?? null}
        onSlackPostChange={(next) =>
          setSlackPost({ phase: "settled", record: next })
        }
      />

      {/* 5. Synthesis */}
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
              Executive synthesis
            </div>
            <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-foreground">
              {synthesis.summary}
            </p>
            <div className="mt-2 font-mono text-[10px] text-muted-foreground">
              review {synthesis.reviewId}
            </div>
          </div>
        </li>
      )}

      {/* 5b. Deal-desk artifacts — the five downloadable outputs derived
          from the comms agent's drafts + the upstream agent state. Renders
          right after synthesis so the visitor sees the agents' work and is
          immediately offered the take-aways. */}
      {synthesis && (
        <li className="relative pt-1">
          <span
            aria-hidden
            className="absolute -left-[26px] top-3 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground sm:-left-[34px]"
          >
            <FileText className="h-2.5 w-2.5" />
          </span>
          <ArtifactsPanel reviewId={synthesis.reviewId} />
        </li>
      )}

      {/* 6. Phase 5 panels — similar past deals + customer context. Mount as
          soon as the orchestrator's Step 2 fan-out finishes (well before
          synthesis), so the visitor sees the institutional-memory + external-
          context surfaces fill in alongside the agent timeline. */}
      {(similarDeals || customerSignals) && (
        <li className="relative pt-1">
          <span
            aria-hidden
            className="absolute -left-[26px] top-3 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground sm:-left-[34px]"
          >
            <GitBranch className="h-2.5 w-2.5" />
          </span>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <SimilarDealsPanel deals={similarDeals} />
            <CustomerSignalsPanel result={customerSignals} />
          </div>
        </li>
      )}

      {done && !synthesis && (
        <li className="text-xs text-muted-foreground">Stream ended.</li>
      )}
    </ol>
  );
}

function TimelineRow({
  index,
  parent,
  state,
  slackPost,
  reviewId,
  onSlackPostChange,
}: {
  index: number;
  parent: ParentName;
  state: StepState;
  slackPost?: SlackPostUiState | null;
  reviewId?: string | null;
  onSlackPostChange?: (next: SlackPostRecord) => void;
}) {
  const plan = SUBSTEP_PLANS[parent];
  return (
    <li className="relative">
      <StepDot index={index} status={state.status} />
      <StepCard
        parent={parent}
        state={state}
        plan={plan}
        slackPost={slackPost}
        reviewId={reviewId}
        onSlackPostChange={onSlackPostChange}
      />
    </li>
  );
}

function ParallelAgentCard({
  parent,
  state,
}: {
  parent: ParentName;
  state: StepState;
}) {
  const plan = SUBSTEP_PLANS[parent];
  return <StepCard parent={parent} state={state} plan={plan} compact />;
}

function StepCard({
  parent,
  state,
  plan,
  compact = false,
  slackPost,
  reviewId,
  onSlackPostChange,
}: {
  parent: ParentName;
  state: StepState;
  plan: SubstepPlan[];
  compact?: boolean;
  slackPost?: SlackPostUiState | null;
  reviewId?: string | null;
  onSlackPostChange?: (next: SlackPostRecord) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-card transition-colors",
        state.status === "running" && "border-[var(--brand)]/40 bg-[var(--brand)]/[0.03]",
        state.status === "complete" && "border-border",
        state.status === "error" && "border-red-300 bg-red-50/50 dark:bg-red-900/10",
        state.status === "pending" && "border-border opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 sm:px-4 sm:py-3">
        <div className="min-w-0">
          <div className={cn("text-sm font-medium text-foreground", compact && "text-[13px]")}>
            {parent}
          </div>
          {!compact && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {STEP_NOTES[parent]}
            </div>
          )}
        </div>
        <StatusLabel status={state.status} />
      </div>

      {state.status === "error" && state.errorMessage && (
        <div className="border-t border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300 sm:px-4">
          {state.errorMessage}
        </div>
      )}

      {plan && (state.status === "running" || state.status === "complete") && (
        <SubstepList plan={plan} state={state} parentStatus={state.status} />
      )}

      {(state.status === "running" || state.status === "complete") &&
        state.partialOutput !== undefined && (
          <div className="border-t border-border p-3 sm:p-4">
            <AgentOutputRouter
              parent={parent}
              payload={state.partialOutput}
              slackPost={slackPost}
              reviewId={reviewId}
              onSlackPostChange={onSlackPostChange}
            />
          </div>
        )}
    </div>
  );
}

function AgentOutputRouter({
  parent,
  payload,
  slackPost,
  reviewId,
  onSlackPostChange,
}: {
  parent: ParentName;
  payload: unknown;
  slackPost?: SlackPostUiState | null;
  reviewId?: string | null;
  onSlackPostChange?: (next: SlackPostRecord) => void;
}) {
  if (parent === "Pricing Agent") {
    return <AgentOutputCard output={payload as Parameters<typeof AgentOutputCard>[0]["output"]} />;
  }
  if (parent === "ASC 606 Agent") {
    return <Asc606Card output={payload as Parameters<typeof Asc606Card>[0]["output"]} />;
  }
  if (parent === "Redline Agent") {
    return <RedlineCard output={payload as Parameters<typeof RedlineCard>[0]["output"]} />;
  }
  if (parent === "Approval Agent") {
    return <ApprovalCard output={payload as Parameters<typeof ApprovalCard>[0]["output"]} />;
  }
  if (parent === "Comms Agent") {
    return (
      <CommsCard
        output={payload as Parameters<typeof CommsCard>[0]["output"]}
        slackPost={slackPost}
        reviewId={reviewId}
        onSlackPostChange={onSlackPostChange}
      />
    );
  }
  // Orchestrator has no structured output beyond synthesis; render nothing.
  return null;
}

function SubstepList({
  plan,
  state,
  parentStatus,
}: {
  plan: SubstepPlan[];
  state: StepState;
  parentStatus: Status;
}) {
  const [expanded, setExpanded] = useState(false);

  const counts = useMemo(
    () => ({
      total: plan.length,
      complete: plan.filter((p) => state.substeps[p.id]?.status === "complete")
        .length,
    }),
    [plan, state.substeps],
  );
  const elapsedMs =
    state.completedAt && state.startedAt
      ? state.completedAt - state.startedAt
      : null;

  const effectiveOpen = parentStatus === "running" ? true : expanded;

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
      {effectiveOpen && (
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
  return (
    <span
      aria-hidden
      className={cn(base, "border border-border bg-background text-muted-foreground")}
    >
      {index}
    </span>
  );
}

// The parallel-group dot collapses three sibling statuses into one. Running if
// any are running; complete only when all three are complete.
function ParallelGroupDot({ status }: { status: Status }) {
  const base =
    "absolute -left-[26px] top-3 inline-flex h-4 w-4 items-center justify-center rounded-full font-mono text-[10px] sm:-left-[34px]";
  if (status === "running") {
    return (
      <span
        aria-hidden
        className={cn(base, "border border-[var(--brand)] bg-[var(--brand)] text-white")}
      >
        <Layers className="h-2.5 w-2.5" />
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
  return (
    <span
      aria-hidden
      className={cn(base, "border border-border bg-background text-muted-foreground")}
    >
      2
    </span>
  );
}

function collapseStatuses(arr: Status[]): Status {
  if (arr.some((s) => s === "error")) return "error";
  if (arr.some((s) => s === "running")) return "running";
  if (arr.every((s) => s === "complete")) return "complete";
  return "pending";
}

function StatusLabel({ status }: { status: Status }) {
  const map: Record<Status, { text: string; className: string }> = {
    pending: { text: "Pending", className: "text-muted-foreground" },
    running: { text: "Running", className: "text-[var(--brand)]" },
    complete: {
      text: "Complete",
      className: "text-emerald-700 dark:text-emerald-400",
    },
    error: { text: "Error", className: "text-red-700 dark:text-red-400" },
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
