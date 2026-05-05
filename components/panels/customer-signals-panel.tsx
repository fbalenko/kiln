"use client";

import { useState } from "react";
import { ArrowUpRight, Banknote, Briefcase, Rocket, Globe } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CustomerSignal,
  CustomerSignalsResult,
  SignalKind,
} from "@/lib/tools/exa-search";

// Phase 5 — Exa-backed customer-context panel rendered alongside the synthesis.
// Shows up to MAX_VISIBLE signals; "View all" expands up to MAX_EXPANDED.

const MAX_VISIBLE = 3;
const MAX_EXPANDED = 9;

const KIND_META: Record<
  SignalKind,
  { icon: LucideIcon; label: string; tone: string }
> = {
  funding: {
    icon: Banknote,
    label: "Funding",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  leadership: {
    icon: Briefcase,
    label: "Leadership",
    tone: "border-violet-200 bg-violet-50 text-violet-700",
  },
  product: {
    icon: Rocket,
    label: "Product",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  other: {
    icon: Globe,
    label: "News",
    tone: "border-border bg-muted text-muted-foreground",
  },
};

export function CustomerSignalsPanel({
  result,
}: {
  result: CustomerSignalsResult | null;
}) {
  const [expanded, setExpanded] = useState(false);

  if (result === null) {
    return (
      <section className="rounded-md border border-border bg-card">
        <PanelHeader />
        <SkeletonRows />
      </section>
    );
  }

  const signals = result.signals;
  const visible = expanded
    ? signals.slice(0, MAX_EXPANDED)
    : signals.slice(0, MAX_VISIBLE);
  const canExpand = signals.length > MAX_VISIBLE;

  return (
    <section className="rounded-md border border-border bg-card">
      <PanelHeader
        customerName={result.customer.name}
        sourceLabel={
          result.source === "exa"
            ? `Exa · last 6mo`
            : "Exa unavailable"
        }
      />

      {signals.length === 0 ? (
        <div className="px-3.5 py-4 text-xs text-muted-foreground sm:px-4">
          {result.note ?? "No recent public signals found."}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {visible.map((s) => (
              <SignalRow key={s.url} signal={s} />
            ))}
          </ul>
          {canExpand && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full border-t border-border px-3.5 py-2 text-left text-[11px] text-muted-foreground transition hover:bg-surface-hover sm:px-4"
            >
              {expanded
                ? "Show fewer"
                : `View all (${Math.min(signals.length, MAX_EXPANDED)})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function PanelHeader({
  customerName,
  sourceLabel,
}: {
  customerName?: string;
  sourceLabel?: string;
}) {
  return (
    <header className="flex items-baseline justify-between gap-3 border-b border-border px-3.5 py-2.5 sm:px-4">
      <div>
        <h3 className="text-[13px] font-semibold text-foreground">
          {customerName ? `${customerName} signals` : "Customer signals"}
        </h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Recent public news · funding, leadership, product
        </p>
      </div>
      {sourceLabel && (
        <span className="text-[11px] text-muted-foreground">{sourceLabel}</span>
      )}
    </header>
  );
}

function SignalRow({ signal }: { signal: CustomerSignal }) {
  const { icon: Icon, label, tone } = KIND_META[signal.kind] ?? KIND_META.other;
  return (
    <li>
      <a
        href={signal.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block px-3.5 py-3 transition-colors hover:bg-surface-hover sm:px-4"
      >
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-[10px] font-medium uppercase tracking-wider",
              tone,
            )}
          >
            <Icon className="h-2.5 w-2.5" />
            {label}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1.5">
              <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
                {signal.headline}
              </p>
              <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground transition-colors group-hover:text-[var(--brand)]" />
            </div>
            {signal.summary && signal.summary !== signal.headline && (
              <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                {signal.summary}
              </p>
            )}
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="font-mono">{signal.source_domain}</span>
              {signal.published_date && (
                <>
                  <span>·</span>
                  <span>{formatDate(signal.published_date)}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </a>
    </li>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SkeletonRows() {
  return (
    <ul className="divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <li key={i} className="px-3.5 py-3 sm:px-4">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-full animate-pulse rounded bg-muted/70" />
          <div className="mt-1 h-3 w-3/4 animate-pulse rounded bg-muted/70" />
        </li>
      ))}
    </ul>
  );
}
