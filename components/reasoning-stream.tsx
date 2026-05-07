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
import { AGENT_IDENTITY } from "@/lib/agent-identity";
import { CompletedView } from "@/components/deal/completed-view";
import type {
  ApprovalOutput,
  Asc606Output,
  CommsOutput,
  PricingOutput,
  RedlineOutput,
} from "@/lib/agents/schemas";
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
  // Reserved-slot marker: disabled substeps render as muted placeholders
  // and never count toward the running/complete tally. Used today only
  // for the Clay-MCP enrichment slot in the orchestrator timeline.
  disabled?: boolean;
}

const ORCHESTRATOR_SUBSTEPS: SubstepPlan[] = [
  { id: "fetch_deal", defaultLabel: "Fetch deal record and customer", icon: Database },
  // Reserved per docs/12-redesign-plan.md §3.4 + §4. Renders disabled.
  { id: "clay_enrichment", defaultLabel: "Clay enrichment — not connected", icon: Sparkles, disabled: true },
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

export type StreamPhase = "idle" | "running" | "complete";

export function ReasoningStream({
  dealId,
  live = false,
  hidePanels = false,
  onPanelData,
  onPhaseChange,
}: {
  dealId: string;
  live?: boolean;
  // When true, the Mode-1 internal panels (similar deals + customer
  // signals) don't render here. The parent (DealWorkspace) renders
  // them in the left rail instead, sharing data via onPanelData.
  hidePanels?: boolean;
  // Fires whenever an SSE panel_data event arrives — the parent
  // mirrors the data into its own state for left-rail rendering.
  onPanelData?: (
    panel: "similar_deals" | "customer_signals",
    data: unknown,
  ) => void;
  // Fires "running" once any SSE event arrives, "complete" once the
  // synthesis event lands. The parent uses this to switch from the
  // workbench split to the verdict-first full-width Mode 2 layout.
  onPhaseChange?: (phase: StreamPhase) => void;
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

    let phaseEmitted: StreamPhase = "idle";
    const emitPhase = (p: StreamPhase) => {
      if (phaseEmitted === p) return;
      phaseEmitted = p;
      onPhaseChange?.(p);
    };

    es.onmessage = (msg) => {
      let ev: StreamEvent;
      try {
        ev = JSON.parse(msg.data) as StreamEvent;
      } catch {
        return;
      }

      // First event of any kind flips the parent into "running."
      emitPhase("running");

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
          // Mirror to parent so the left rail can render the panels
          // without subscribing to its own SSE stream.
          onPanelData?.(ev.panel, ev.data);
          break;
        }
        case "slack_post": {
          setSlackPost({ phase: "settled", record: ev.record });
          break;
        }
        case "synthesis": {
          setSynthesis({ summary: ev.summary, reviewId: ev.review_id });
          setDone(true);
          emitPhase("complete");
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
    // onPanelData / onPhaseChange are stable callbacks from the parent;
    // including them would re-open the SSE stream on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, live]);

  // The agent-only timeline. In Mode 1 (running) this is the dominant
  // surface; in Mode 2 (post-synthesis) it's tucked behind the
  // "View reasoning trace" expander inside <CompletedView>.
  const agentTimeline = (
    <ol className="relative space-y-2.5 border-l border-border pl-6 sm:pl-8">
      <TimelineRow
        index={1}
        parent="Orchestrator"
        state={steps.Orchestrator}
      />
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
      <TimelineRow
        index={3}
        parent="Approval Agent"
        state={steps["Approval Agent"]}
      />
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
    </ol>
  );

  // Mode 2 — the orchestrator's synthesis has fired and every agent has a
  // finalOutput we can hand to <CompletedView>. We delay the layout swap
  // by a tick if any agent's finalOutput is missing (defensive — should not
  // happen in practice because synthesis fires *after* every step_complete).
  const finalOutputs = collectFinalOutputs(steps);
  const elapsedMs =
    steps.Orchestrator.startedAt && steps.Orchestrator.completedAt
      ? steps.Orchestrator.completedAt - steps.Orchestrator.startedAt
      : null;
  const substepCount = countCompletedSubsteps(steps);

  if (synthesis && finalOutputs) {
    return (
      <CompletedView
        pricing={finalOutputs.pricing}
        asc606={finalOutputs.asc606}
        redline={finalOutputs.redline}
        approval={finalOutputs.approval}
        comms={finalOutputs.comms}
        synthesis={synthesis}
        similarDeals={similarDeals}
        customerSignals={customerSignals}
        slackPost={slackPost}
        timeline={agentTimeline}
        totalElapsedMs={elapsedMs}
        substepCount={substepCount}
        agentCount={5}
        onSlackPostChange={(next) =>
          setSlackPost({ phase: "settled", record: next })
        }
      />
    );
  }

  // Mode 1 — running. Render the timeline; panels render here only when
  // the parent isn't already showing them in a left rail (hidePanels=true).
  return (
    <div className="space-y-3">
      {agentTimeline}

      {!hidePanels && (similarDeals || customerSignals) && (
        <div className="grid grid-cols-1 gap-3 pl-6 sm:pl-8 lg:grid-cols-2">
          <SimilarDealsPanel deals={similarDeals} />
          <CustomerSignalsPanel result={customerSignals} />
        </div>
      )}

      {done && !synthesis && (
        <p className="pl-6 text-xs text-muted-foreground sm:pl-8">
          Stream ended.
        </p>
      )}
    </div>
  );
}

// Final-output extractor. Returns null until every agent has emitted its
// step_complete event (defensive — synthesis arrives after, so this is
// rarely null when synthesis is set).
function collectFinalOutputs(steps: Record<ParentName, StepState>): {
  pricing: PricingOutput;
  asc606: Asc606Output;
  redline: RedlineOutput;
  approval: ApprovalOutput;
  comms: CommsOutput;
} | null {
  const p = steps["Pricing Agent"].finalOutput;
  const a = steps["ASC 606 Agent"].finalOutput;
  const r = steps["Redline Agent"].finalOutput;
  const ap = steps["Approval Agent"].finalOutput;
  const c = steps["Comms Agent"].finalOutput;
  if (!p || !a || !r || !ap || !c) return null;
  return {
    pricing: p as PricingOutput,
    asc606: a as Asc606Output,
    redline: r as RedlineOutput,
    approval: ap as ApprovalOutput,
    comms: c as CommsOutput,
  };
}

function countCompletedSubsteps(
  steps: Record<ParentName, StepState>,
): number {
  let n = 0;
  for (const k of Object.keys(steps) as ParentName[]) {
    for (const sub of Object.values(steps[k].substeps)) {
      if (sub.status === "complete") n++;
    }
  }
  return n;
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
  const identity = AGENT_IDENTITY[parent];
  // 2px left-border accent in the agent's identity color makes the five
  // lanes (Pricing/ASC 606/Redline/Approval/Comms) scannable as distinct
  // tracks. Hidden while pending so the timeline reads dim before the
  // substep tape starts ticking.
  const showAccent =
    parent !== "Orchestrator" && state.status !== "pending";
  return (
    <div
      style={
        showAccent ? { borderLeftColor: identity.hex, borderLeftWidth: 2 } : undefined
      }
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

  // Disabled substeps (the reserved Clay slot) don't count toward the
  // running tally — otherwise the rollup would forever read "8 of 9."
  const counts = useMemo(() => {
    const live = plan.filter((p) => p.disabled !== true);
    return {
      total: live.length,
      complete: live.filter(
        (p) => state.substeps[p.id]?.status === "complete",
      ).length,
    };
  }, [plan, state.substeps]);
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
        <ul className="space-y-0 px-3.5 py-1.5 sm:px-4">
          {plan.map((p) => {
            const sub = state.substeps[p.id];
            const isDisabled = p.disabled === true;
            // Disabled substeps (e.g. the reserved Clay-enrichment slot)
            // never receive SSE updates — render permanently as a muted
            // "not connected" hint so the timeline shows the upcoming
            // capability without pretending it's running.
            const status = isDisabled
              ? "pending"
              : (sub?.status ?? "pending");
            const Icon = p.icon;
            return (
              <li
                key={p.id}
                className={cn(
                  "flex items-center gap-2 rounded px-1.5 py-0.5 text-[12px] leading-tight transition-colors",
                  isDisabled && "italic text-foreground/30",
                  !isDisabled &&
                    status === "running" &&
                    "bg-[var(--brand)]/[0.06] text-foreground",
                  !isDisabled &&
                    status === "complete" &&
                    "text-muted-foreground",
                  !isDisabled &&
                    status === "pending" &&
                    "text-foreground/35",
                )}
              >
                <SubstepGlyph status={status} icon={Icon} />
                <span className="min-w-0 flex-1 truncate">
                  {sub?.label ?? p.defaultLabel}
                </span>
                {isDisabled && (
                  <span className="shrink-0 text-[9.5px] font-medium uppercase tracking-wider text-[var(--brand)]/60">
                    Phase 8
                  </span>
                )}
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
