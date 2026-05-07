"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  Banknote,
  Briefcase,
  Globe,
  Lock,
  Rocket,
} from "lucide-react";
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

type SignalsTab = "exa" | "clay";

export function CustomerSignalsPanel({
  result,
}: {
  result: CustomerSignalsResult | null;
}) {
  const [tab, setTab] = useState<SignalsTab>("exa");
  const [expanded, setExpanded] = useState(false);

  if (result === null) {
    return (
      <section className="rounded-md border border-border bg-card">
        <PanelHeader />
        <SignalsTabBar tab={tab} onTab={setTab} />
        {tab === "exa" ? <SkeletonRows /> : <ClayPlaceholder />}
      </section>
    );
  }

  const signals = result.signals;
  const isSimulated = result.source === "simulated";
  const visible = expanded
    ? signals.slice(0, MAX_EXPANDED)
    : signals.slice(0, MAX_VISIBLE);
  const canExpand = signals.length > MAX_VISIBLE;

  return (
    <section className="rounded-md border border-border bg-card">
      <PanelHeader
        customerName={result.customer.name}
        sourceLabel={tab === "exa" ? sourceLabelFor(result.source) : undefined}
        isSimulated={tab === "exa" && isSimulated}
      />
      <SignalsTabBar tab={tab} onTab={setTab} />

      {tab === "clay" ? (
        <ClayPlaceholder />
      ) : signals.length === 0 ? (
        <div className="px-3.5 py-4 text-xs text-muted-foreground sm:px-4">
          {result.note ?? "No recent public signals found."}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {visible.map((s, i) => (
              <SignalRow
                key={signalKey(s, i)}
                signal={s}
                clickable={!isSimulated && s.url.length > 0}
              />
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

// Two-tab strip — Exa (active, real signals) and Clay (locked, phase-8
// placeholder). Clay is selectable so the visitor can read the empty-
// state copy; it never displays signal data because no integration is
// wired today.
function SignalsTabBar({
  tab,
  onTab,
}: {
  tab: SignalsTab;
  onTab: (next: SignalsTab) => void;
}) {
  return (
    <div className="flex gap-0 border-b border-border bg-surface-secondary text-[11px]">
      <TabButton
        active={tab === "exa"}
        onClick={() => onTab("exa")}
        accentColor="#3B82F6"
      >
        Exa
      </TabButton>
      <TabButton
        active={tab === "clay"}
        onClick={() => onTab("clay")}
        accentColor="#3B82F6"
        suffix={
          <span className="ml-1.5 inline-flex items-center gap-1 text-[9.5px] uppercase tracking-wider text-[var(--brand)]/70">
            <Lock className="h-2 w-2" strokeWidth={2.5} />
            Phase 8
          </span>
        }
      >
        Clay
      </TabButton>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  accentColor,
  suffix,
  children,
}: {
  active: boolean;
  onClick: () => void;
  accentColor: string;
  suffix?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-1 px-3 py-1.5 transition",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="font-medium">{children}</span>
      {suffix}
      {active && (
        <span
          aria-hidden
          className="absolute inset-x-2 -bottom-px h-[2px]"
          style={{ backgroundColor: accentColor }}
        />
      )}
    </button>
  );
}

// Empty-state body for the Clay tab. Mirrors the dashboard's locked
// KPI tile §3.2.2: dashed border, lock icon, italic phase-8 caption.
function ClayPlaceholder() {
  return (
    <div className="flex flex-col items-start gap-2 px-3.5 py-4 sm:px-4">
      <div className="inline-flex items-center gap-2 rounded-md border border-dashed border-[var(--brand)]/30 bg-[var(--brand)]/[0.02] px-2.5 py-2 text-[11px] text-[var(--brand)]/80">
        <Lock className="h-3 w-3" strokeWidth={1.75} aria-hidden />
        <span className="font-medium">Phase 8 · MCP integration</span>
      </div>
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        Clay&rsquo;s MCP connector will populate company size, funding,
        tech stack, leadership changes, and intent signals here when
        the integration ships.
      </p>
    </div>
  );
}

function sourceLabelFor(
  source: CustomerSignalsResult["source"],
): string | undefined {
  if (source === "exa") return "Exa · last 6mo";
  if (source === "exa_unavailable") return "Exa unavailable";
  if (source === "simulated") return undefined; // badge replaces this
  return undefined;
}

function signalKey(s: CustomerSignal, fallbackIdx: number): string {
  if (s.url) return s.url;
  return `${s.published_date ?? "x"}-${s.headline.slice(0, 60)}-${fallbackIdx}`;
}

function PanelHeader({
  customerName,
  sourceLabel,
  isSimulated,
}: {
  customerName?: string;
  sourceLabel?: string;
  isSimulated?: boolean;
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
      {isSimulated ? (
        <SimulatedBadge />
      ) : (
        sourceLabel && (
          <span className="text-[11px] text-muted-foreground">
            {sourceLabel}
          </span>
        )
      )}
    </header>
  );
}

function SimulatedBadge() {
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-medium uppercase tracking-wider text-amber-800"
      title="These signals are hand-authored demo fixtures, not live web results. Used because this customer is fictional."
    >
      Simulated · Demo data
    </span>
  );
}

function SignalRow({
  signal,
  clickable,
}: {
  signal: CustomerSignal;
  clickable: boolean;
}) {
  const { icon: Icon, label, tone } = KIND_META[signal.kind] ?? KIND_META.other;
  const body = (
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
          {clickable && (
            <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground transition-colors group-hover:text-[var(--brand)]" />
          )}
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
  );

  if (clickable) {
    return (
      <li>
        <a
          href={signal.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group block px-3.5 py-3 transition-colors hover:bg-surface-hover sm:px-4"
        >
          {body}
        </a>
      </li>
    );
  }
  // Simulated signals — no link, no hover affordance, no external arrow.
  // The header's "Simulated · Demo data" badge handles disclosure.
  return (
    <li className="block px-3.5 py-3 sm:px-4">{body}</li>
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
