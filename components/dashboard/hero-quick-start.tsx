import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { DealWithCustomer } from "@/lib/db/queries";
import { DifficultyBadge } from "@/components/deal/difficulty-badge";
import { formatACV } from "@/lib/format";
import { cn } from "@/lib/utils";

// Replaces the prior 2-card EntryCard grid. Renders the five hero
// scenarios as compact tiles + a "Browse all 40 deals" footer card.
//
// Hard navigation (<a href>) per the dashboard convention — direct hits
// to /deals/<id> render the standalone full page rather than the slide-
// over the pipeline triggers via intercepting routes.

export function HeroQuickStart({
  heroes,
  totalDealCount,
}: {
  heroes: DealWithCustomer[];
  totalDealCount: number;
}) {
  const recommended = heroes.find((h) => h.scenario_meta?.is_recommended === 1);
  const others = heroes.filter((h) => h !== recommended);

  return (
    <section
      aria-label="Quick start — hero scenarios"
      className="rounded-md border border-border bg-card"
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2">
        <h2 className="text-[12px] font-semibold text-foreground">
          Quick start
        </h2>
        <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
          {heroes.length} scenarios
        </span>
      </header>
      <ul className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 sm:divide-x">
        {recommended ? (
          <li className="sm:col-span-2 sm:border-b sm:border-border sm:divide-x-0">
            <HeroRow deal={recommended} highlighted />
          </li>
        ) : null}
        {others.map((deal) => (
          <li key={deal.id}>
            <HeroRow deal={deal} />
          </li>
        ))}
      </ul>
      <a
        href="/pipeline"
        className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-[12px] text-muted-foreground transition hover:bg-surface-hover hover:text-foreground"
      >
        <span>Browse all {totalDealCount} deals</span>
        <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
      </a>
    </section>
  );
}

function HeroRow({
  deal,
  highlighted = false,
}: {
  deal: DealWithCustomer;
  highlighted?: boolean;
}) {
  return (
    <a
      href={`/deals/${deal.id}`}
      className={cn(
        "flex h-full flex-col gap-1.5 px-3 py-2.5 transition hover:bg-surface-hover sm:px-3.5 sm:py-3",
        highlighted && "bg-[var(--brand)]/[0.03]",
      )}
    >
      <div className="flex items-center gap-2">
        {highlighted && (
          <span
            aria-hidden
            className="relative inline-flex h-1.5 w-1.5"
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--brand)] opacity-50" />
            <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
          </span>
        )}
        <span className="truncate text-[12.5px] font-medium text-foreground">
          {deal.customer.name}
        </span>
        {deal.scenario_meta ? (
          <DifficultyBadge difficulty={deal.scenario_meta.difficulty_label} />
        ) : null}
        <span className="ml-auto font-mono text-[11.5px] tabular-nums text-muted-foreground">
          {formatACV(deal.acv)}
        </span>
      </div>
      <p className="line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">
        {deal.scenario_meta?.hero_tagline ?? deal.name}
      </p>
    </a>
  );
}
