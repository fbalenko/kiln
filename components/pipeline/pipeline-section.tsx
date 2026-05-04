import Link from "next/link";
import { Building2, FileText, DollarSign, Calendar, Tag } from "lucide-react";
import type { DealWithCustomer } from "@/lib/db/queries";
import { StageBadge } from "@/components/deal/stage-badge";
import { DifficultyBadge } from "@/components/deal/difficulty-badge";
import { StartHereTag } from "./start-here-tag";
import { formatACV, formatTerm } from "@/lib/format";
import { cn } from "@/lib/utils";

// Mobile: flex layout with row# / merged-cell / stage badge.
// Desktop (sm+): full Clay-style table grid with separate columns for
// customer, deal name + tagline, ACV, Term, and Stage.
const ROW_BASE =
  "flex items-center gap-3 px-3 py-2 transition sm:grid sm:grid-cols-[52px_minmax(0,1.4fr)_minmax(0,2.2fr)_88px_64px_104px] sm:gap-4 sm:px-6";

export function PipelineSection({
  title,
  subtitle,
  deals,
  startIndex = 1,
  muted = false,
}: {
  title: string;
  subtitle?: string;
  deals: DealWithCustomer[];
  startIndex?: number;
  muted?: boolean;
}) {
  return (
    <section className="mt-6 first:mt-4">
      <div className="mb-2 flex items-baseline justify-between gap-3 px-4 sm:px-6">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {subtitle ? (
          <span className="text-[11px] text-muted-foreground">{subtitle}</span>
        ) : null}
      </div>
      <div className="border-y border-border">
        <PipelineHeader />
        <ul>
          {deals.map((deal, i) => (
            <li key={deal.id}>
              <PipelineRow
                deal={deal}
                rowNum={startIndex + i}
                striped={i % 2 === 1}
                muted={muted}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PipelineHeader() {
  return (
    <div
      className={cn(
        ROW_BASE,
        "border-b border-border bg-surface-secondary py-1.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground",
      )}
    >
      <span aria-hidden className="w-6 text-right font-mono sm:w-auto">
        #
      </span>
      <HeaderCell icon={Building2}>Customer</HeaderCell>
      <HeaderCell icon={FileText} className="hidden sm:flex">
        Deal
      </HeaderCell>
      <HeaderCell icon={DollarSign} align="right" className="hidden sm:flex">
        ACV
      </HeaderCell>
      <HeaderCell icon={Calendar} align="right" className="hidden sm:flex">
        Term
      </HeaderCell>
      <HeaderCell icon={Tag} align="right" className="ml-auto sm:ml-0">
        Stage
      </HeaderCell>
    </div>
  );
}

function HeaderCell({
  icon: Icon,
  children,
  align = "left",
  className,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5",
        align === "right" ? "justify-end" : "justify-start",
        className,
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={1.75} aria-hidden />
      {children}
    </span>
  );
}

function PipelineRow({
  deal,
  rowNum,
  striped,
  muted,
}: {
  deal: DealWithCustomer;
  rowNum: number;
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
        ROW_BASE,
        "border-b border-border last:border-b-0 hover:bg-surface-hover",
        striped && !muted ? "bg-surface-secondary/40" : "",
        muted ? "opacity-85 hover:opacity-100" : "",
      )}
    >
      <span className="w-6 text-right font-mono text-[11px] tabular-nums text-muted-foreground sm:w-auto">
        {rowNum}
      </span>
      <div className="min-w-0 flex-1 sm:flex-none">
        {isStartHere ? (
          <div className="mb-1">
            <StartHereTag />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-[13px] font-medium text-foreground">
            {deal.customer.name}
          </span>
          {deal.scenario_meta ? (
            <DifficultyBadge difficulty={deal.scenario_meta.difficulty_label} />
          ) : null}
        </div>
        {/* Mobile shows the deal name folded into the customer cell */}
        <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground sm:hidden">
          {deal.name}
        </div>
      </div>
      <div className="hidden min-w-0 sm:block">
        <div className="truncate text-[12.5px] text-foreground">
          {deal.name}
        </div>
        {tagline ? (
          <div className="mt-0.5 line-clamp-1 text-[11.5px] text-muted-foreground">
            {tagline}
          </div>
        ) : null}
      </div>
      <div className="hidden text-right font-mono text-[12.5px] tabular-nums text-foreground sm:block">
        {formatACV(deal.acv)}
      </div>
      <div className="hidden text-right font-mono text-[11.5px] tabular-nums text-muted-foreground sm:block">
        {formatTerm(deal.term_months)}
      </div>
      <div className="ml-auto flex flex-shrink-0 justify-end sm:ml-0">
        <StageBadge stage={deal.stage} />
      </div>
    </Link>
  );
}
