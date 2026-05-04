import Link from "next/link";
import type { DealWithCustomer } from "@/lib/db/queries";
import { StageBadge } from "@/components/deal/stage-badge";
import { DifficultyBadge } from "@/components/deal/difficulty-badge";
import { StartHereTag } from "./start-here-tag";
import { formatACV, formatTerm } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PipelineSection({
  title,
  subtitle,
  deals,
  muted = false,
}: {
  title: string;
  subtitle?: string;
  deals: DealWithCustomer[];
  muted?: boolean;
}) {
  return (
    <section className="mt-8 first:mt-6">
      <div className="mb-3 flex items-baseline justify-between gap-3 px-4 sm:px-6">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {subtitle ? (
          <span className="text-[11px] text-muted-foreground">{subtitle}</span>
        ) : null}
      </div>
      <ul className="border-y border-border">
        {deals.map((deal, i) => (
          <li key={deal.id}>
            <PipelineRow deal={deal} striped={i % 2 === 1} muted={muted} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PipelineRow({
  deal,
  striped,
  muted,
}: {
  deal: DealWithCustomer;
  striped: boolean;
  muted: boolean;
}) {
  const isStartHere = deal.scenario_meta?.is_recommended === 1;
  const tagline =
    deal.scenario_meta?.hero_tagline ??
    deal.discount_reason ??
    deal.competitive_context ??
    null;

  return (
    <Link
      href={`/deals/${deal.id}`}
      className={cn(
        "group relative flex items-center gap-3 border-l-2 px-4 py-3 transition hover:bg-accent sm:gap-4 sm:px-6",
        isStartHere ? "border-l-clay" : "border-l-transparent",
        striped && !muted ? "bg-secondary/40" : "",
        muted ? "bg-background opacity-80 hover:opacity-100" : "",
      )}
    >
      <div className="min-w-0 flex-1">
        {isStartHere ? (
          <div className="mb-1.5">
            <StartHereTag />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium text-foreground">
            {deal.customer.name}
          </span>
          {deal.scenario_meta ? (
            <DifficultyBadge difficulty={deal.scenario_meta.difficulty_label} />
          ) : null}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {deal.name}
        </div>
        {tagline ? (
          <div className="mt-1 line-clamp-2 hidden text-xs text-muted-foreground sm:block">
            {tagline}
          </div>
        ) : null}
      </div>
      <div className="hidden text-right sm:block">
        <div className="font-mono text-sm tabular-nums text-foreground">
          {formatACV(deal.acv)}
        </div>
        <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatTerm(deal.term_months)}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center">
        <StageBadge stage={deal.stage} />
      </div>
    </Link>
  );
}
