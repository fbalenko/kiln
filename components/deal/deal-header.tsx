import Link from "next/link";
import type { DealWithCustomer } from "@/lib/db/queries";
import { StageBadge } from "./stage-badge";
import { formatACV, formatTerm } from "@/lib/format";

export function DealHeader({ deal }: { deal: DealWithCustomer }) {
  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/pipeline"
            className="text-xs text-muted-foreground transition hover:text-foreground"
          >
            ← Pipeline
          </Link>
          <StageBadge stage={deal.stage} />
        </div>
        <div className="mt-2 flex flex-col gap-3 sm:mt-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {deal.customer.name}
            </div>
            <h1 className="mt-0.5 truncate text-lg font-semibold tracking-tight sm:text-xl">
              {deal.name}
            </h1>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 sm:gap-x-7">
            <Metric label="ACV" value={formatACV(deal.acv)} />
            <Metric label="TCV" value={formatACV(deal.tcv)} />
            <Metric label="Term" value={formatTerm(deal.term_months)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-sm tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}
