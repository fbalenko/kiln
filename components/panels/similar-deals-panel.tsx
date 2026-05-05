"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatACV } from "@/lib/format";
import type { SimilarDealRecord } from "@/lib/tools/vector-search";

// Phase 5 — vector-search panel rendered alongside the executive synthesis.
// Source: orchestrator's Step 2 sqlite-vec k-NN over `deal_embeddings`.
//
// Visitor can click any card to navigate to that deal's review.

export function SimilarDealsPanel({
  deals,
}: {
  deals: SimilarDealRecord[] | null;
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-3.5 py-2.5 sm:px-4">
        <div>
          <h3 className="text-[13px] font-semibold text-foreground">
            Similar past deals
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            k-NN over the seeded pipeline · text-embedding-3-small
          </p>
        </div>
        {deals && deals.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {deals.length} matches
          </span>
        )}
      </header>

      {deals === null ? (
        <SkeletonRows />
      ) : deals.length === 0 ? (
        <div className="px-3.5 py-4 text-xs text-muted-foreground sm:px-4">
          No similar past deals found.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {deals.map((d) => (
            <SimilarDealRow key={d.deal_id} deal={d} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SimilarDealRow({ deal }: { deal: SimilarDealRecord }) {
  return (
    <li>
      <Link
        href={`/deals/${deal.deal_id}`}
        className="group flex items-start gap-3 px-3.5 py-3 transition-colors hover:bg-surface-hover sm:px-4"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-medium text-foreground">
              {deal.customer_name}
            </span>
            <span className="text-[11px] text-muted-foreground">·</span>
            <span className="text-[11px] text-muted-foreground">
              {deal.deal_name}
            </span>
            <OutcomeChip stage={deal.stage} />
          </div>
          <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-foreground/80">
            {deal.decision_note}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span>{formatACV(deal.acv)} ACV</span>
            <span>·</span>
            <span>{deal.discount_pct.toFixed(1)}% off list</span>
            <span>·</span>
            <span className="font-mono">{deal.deal_id}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <SimilarityBadge pct={deal.similarity_pct} />
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-[var(--brand)]" />
        </div>
      </Link>
    </li>
  );
}

function OutcomeChip({ stage }: { stage: string }) {
  if (stage === "closed_won") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-200 bg-emerald-50 text-[10px] uppercase tracking-wider text-emerald-700"
      >
        Won
      </Badge>
    );
  }
  if (stage === "closed_lost") {
    return (
      <Badge
        variant="outline"
        className="border-red-200 bg-red-50 text-[10px] uppercase tracking-wider text-red-700"
      >
        Lost
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
      {stage.replace(/_/g, " ")}
    </Badge>
  );
}

function SimilarityBadge({ pct }: { pct: number }) {
  const tone =
    pct >= 75
      ? "border-[var(--brand)]/40 bg-[var(--brand)]/[0.08] text-[var(--brand)]"
      : pct >= 60
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-sm border px-1.5 font-mono text-[10px]",
        tone,
      )}
    >
      {pct}% sim
    </span>
  );
}

function SkeletonRows() {
  return (
    <ul className="divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <li key={i} className="px-3.5 py-3 sm:px-4">
          <div className="h-3 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-full animate-pulse rounded bg-muted/70" />
          <div className="mt-1 h-3 w-3/4 animate-pulse rounded bg-muted/70" />
        </li>
      ))}
    </ul>
  );
}
