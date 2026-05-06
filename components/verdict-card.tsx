"use client";

import { cn } from "@/lib/utils";
import {
  approvalDepthSeverity,
  asc606FlagSeverity,
  deriveRecommendation,
  discountSeverity,
  marginSeverity,
  recommendationSeverity,
  redlinePrioritySeverity,
  SEVERITY_CLASSES,
  type Recommendation,
  type Severity,
} from "@/lib/severity";
import type {
  ApprovalOutput,
  Asc606Output,
  PricingOutput,
  RedlineOutput,
} from "@/lib/agents/schemas";

// The Mode 2 verdict card — six severity-coloured tiles in a single row
// (collapses to 3×2 on tablet and 2×3 on phone). Renders as soon as the
// orchestrator's synthesis fires; the agent outputs that feed it are by
// then guaranteed to be present.

interface VerdictCardProps {
  pricing: PricingOutput;
  asc606: Asc606Output;
  redline: RedlineOutput;
  approval: ApprovalOutput;
}

export function VerdictCard({
  pricing,
  asc606,
  redline,
  approval,
}: VerdictCardProps) {
  const recommendation = deriveRecommendation({
    redlinePriority: redline.overall_redline_priority,
    approvalBlockers: approval.blockers_to_address_first?.length ?? 0,
    marginPct: pricing.margin_pct_estimate,
  });

  const approverCount = approval.required_approvers?.length ?? 0;

  return (
    <section
      aria-label="Deal verdict"
      className="rounded-md border border-border bg-card animate-in fade-in slide-in-from-bottom-1 duration-300"
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-semibold text-foreground">Verdict</h2>
        <span className="text-[11px] text-muted-foreground">
          Derived from upstream agent outputs
        </span>
      </header>
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
        <RecommendationTile recommendation={recommendation} />
        <Tile
          label="Effective discount"
          value={`${pricing.effective_discount_pct.toFixed(1)}%`}
          severity={discountSeverity(pricing.effective_discount_pct)}
          sub="off list"
        />
        <Tile
          label="Gross margin"
          value={`${pricing.margin_pct_estimate.toFixed(1)}%`}
          severity={marginSeverity(pricing.margin_pct_estimate)}
          sub="estimated"
        />
        <Tile
          label="ASC 606 flags"
          value={String(asc606.red_flags?.length ?? 0)}
          severity={asc606FlagSeverity(asc606.red_flags?.length ?? 0)}
          sub={pluralize(asc606.red_flags?.length ?? 0, "red flag")}
        />
        <Tile
          label="Redline priority"
          value={titleCase(redline.overall_redline_priority)}
          severity={redlinePrioritySeverity(redline.overall_redline_priority)}
          sub={`${redline.flagged_clauses?.length ?? 0} flagged`}
          isText
        />
        <Tile
          label="Approval depth"
          value={`${approverCount}`}
          severity={approvalDepthSeverity(approverCount)}
          sub={`~${approval.expected_cycle_time_business_days} biz days`}
          unit={pluralize(approverCount, "approver")}
        />
      </div>
    </section>
  );
}

function RecommendationTile({
  recommendation,
}: {
  recommendation: Recommendation;
}) {
  const severity = recommendationSeverity(recommendation);
  const cls = SEVERITY_CLASSES[severity];
  return (
    <div
      className={cn(
        "relative flex flex-col justify-between gap-1 px-4 py-3.5 transition-colors",
        cls.bgTint,
      )}
    >
      <div className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
        Recommendation
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-[24px] font-semibold leading-none",
            cls.text,
          )}
        >
          {recommendation}
        </span>
      </div>
      <div className="text-[10.5px] text-muted-foreground">
        {recommendation === "Approve" && "Within all guardrails"}
        {recommendation === "Counter" && "Negotiate before submit"}
        {recommendation === "Escalate" && "Material risk exposure"}
        {recommendation === "Block" && "Cannot route to approval"}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  severity,
  sub,
  unit,
  isText = false,
}: {
  label: string;
  value: string;
  severity: Severity;
  sub: string;
  unit?: string;
  isText?: boolean;
}) {
  const cls = SEVERITY_CLASSES[severity];
  return (
    <div
      className={cn(
        "relative flex flex-col justify-between gap-1 px-4 py-3.5 transition-colors",
        cls.bgTint,
      )}
    >
      <div className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            isText ? "text-[20px]" : "font-mono text-[26px] tabular-nums",
            "font-semibold leading-none",
            cls.text,
          )}
        >
          {value}
        </span>
        {unit && (
          <span className="text-[11px] text-muted-foreground">{unit}</span>
        )}
      </div>
      <div className="text-[10.5px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function pluralize(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
