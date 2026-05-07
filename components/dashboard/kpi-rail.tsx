import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatACV } from "@/lib/format";
import { cardEyebrow } from "@/lib/ui-tokens";

// The five-tile KPI rail at the top of the dashboard.
//
// Tiles 1–4 derive from real data (listDeals + cached_outputs/*-review.json
// via getCachedRiskSummary). Tile 5 is the locked Clay placeholder per
// docs/12-redesign-plan.md §3.2.2.
//
// Per-tile severity comes from the data, not from a hardcoded thresholds
// table on this component — keeping the visual register honest if the
// seed changes.

interface KpiRailProps {
  inReviewCount: number;
  inReviewHeroCount: number;
  acvAtRiskCents: number;
  acvAtRiskCount: number;
  cfoApprovalCount: number;
  cfoApprovalHeroCount: number;
  cfoApprovalHeroTotal: number;
  avgCycleDays: number;
  nReviews: number;
}

export function KpiRail(props: KpiRailProps) {
  return (
    <section
      aria-label="Pipeline health summary"
      className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 lg:grid-cols-5"
    >
      <KpiTile
        label="In review"
        value={String(props.inReviewCount)}
        sub={`${props.inReviewHeroCount} hero ${props.inReviewHeroCount === 1 ? "scenario" : "scenarios"}`}
        href="/pipeline"
      />
      <KpiTile
        label="ACV at risk"
        value={formatACV(props.acvAtRiskCents)}
        sub={
          props.acvAtRiskCount === 0
            ? "no flagged deals"
            : `${props.acvAtRiskCount} ${props.acvAtRiskCount === 1 ? "deal" : "deals"} flagged`
        }
        tone={props.acvAtRiskCount > 0 ? "warn" : "neutral"}
        href="/pipeline"
      />
      <KpiTile
        label="Needs CFO approval"
        value={String(props.cfoApprovalCount)}
        sub={`${props.cfoApprovalHeroCount} of ${props.cfoApprovalHeroTotal} heroes`}
        tone={props.cfoApprovalCount > 0 ? "warn" : "neutral"}
        href="/pipeline"
      />
      <AvgCycleTile
        avgCycleDays={props.avgCycleDays}
        nReviews={props.nReviews}
      />
      <ClayLockedTile />
    </section>
  );
}

function KpiTile({
  label,
  value,
  sub,
  tone = "neutral",
  href,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "warn" | "bad" | "good";
  href?: string;
}) {
  const valueColor =
    tone === "warn"
      ? "text-amber-700"
      : tone === "bad"
        ? "text-red-700"
        : tone === "good"
          ? "text-emerald-700"
          : "text-foreground";

  const body = (
    <div className="flex h-full flex-col justify-between gap-1.5 bg-card px-3 py-2.5 transition-colors hover:bg-surface-hover sm:px-3.5 sm:py-3">
      <div className={cardEyebrow}>{label}</div>
      <div
        className={cn(
          "font-mono text-[24px] font-semibold leading-none tabular-nums",
          valueColor,
        )}
      >
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={`${label}: ${value}, ${sub}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30"
      >
        {body}
      </Link>
    );
  }
  return body;
}

// Tile 4 — the cycle-time estimate. Eyebrow itself reads "Avg cycle (estimate)"
// so the caveat doesn't get lost in the sub-line. When the sample size is
// small (<5 reviews), the sub-line gets a warn-severity dot.
function AvgCycleTile({
  avgCycleDays,
  nReviews,
}: {
  avgCycleDays: number;
  nReviews: number;
}) {
  const lowSample = nReviews > 0 && nReviews < 5;
  return (
    <div className="flex h-full flex-col justify-between gap-1.5 bg-card px-3 py-2.5 sm:px-3.5 sm:py-3">
      <div className={cardEyebrow}>
        Avg cycle <span className="italic normal-case">(estimate)</span>
      </div>
      <div className="font-mono text-[24px] font-semibold leading-none tabular-nums text-foreground">
        {nReviews > 0 ? avgCycleDays.toFixed(1) : "—"}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {lowSample && (
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
          />
        )}
        <span>
          {nReviews === 0
            ? "no reviews yet"
            : `business days · n=${nReviews}`}
        </span>
      </div>
    </div>
  );
}

// Tile 5 — Clay locked placeholder. Dashed brand-blue border, lock icon
// in the big-number slot, italic phase-8 caption. Non-interactive.
function ClayLockedTile() {
  return (
    <div
      className="flex h-full flex-col justify-between gap-1.5 border-2 border-dashed border-[var(--brand)]/30 bg-[var(--brand)]/[0.02] px-3 py-2.5 sm:px-3.5 sm:py-3"
      title="Clay's MCP connector will populate company size, funding, tech stack, leadership changes, and intent signals here."
    >
      <div className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--brand)]">
        Clay enrichment
      </div>
      <Lock
        className="h-6 w-6 text-[var(--brand)]/60"
        strokeWidth={1.75}
        aria-hidden
      />
      <div className="text-[11px] italic text-[var(--brand)]/70">
        Phase 8 · MCP integration
      </div>
    </div>
  );
}
