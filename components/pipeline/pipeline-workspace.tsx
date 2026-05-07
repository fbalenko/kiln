"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  DollarSign,
  Filter as FilterIcon,
  LayoutList,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DealWithCustomer } from "@/lib/db/queries";
import {
  DEFAULT_FILTER_STATE,
  STAGE_VALUES,
  sortLabel,
  stageLabel,
  viewLabel,
  type PipelineFilterState,
  type PipelineSort,
  type PipelineView,
  type Stage,
} from "@/lib/pipeline/filter-state";
import { formatRelative } from "@/lib/pipeline/format-relative";
import { StageBadge } from "@/components/deal/stage-badge";
import { DifficultyBadge } from "@/components/deal/difficulty-badge";
import { StartHereTag } from "./start-here-tag";
import { formatACV, formatTerm } from "@/lib/format";
import type { DealSeverityPreview } from "@/lib/dashboard/cached-summary";

// The pipeline page's interactive surface. The page (Server Component)
// fetches deals + last-activity + cached severity previews, then hands
// them to this component which owns filter/sort/search state in memory.
//
// Filter state shape is a flat record of URL-encodable primitives per
// docs/12-redesign-plan.md §3.4 — eventual URL sync is a one-useEffect
// addition, not a refactor.

interface PipelineWorkspaceProps {
  deals: DealWithCustomer[];
  // Per-deal last-activity timestamp (ISO) — null if no review exists.
  lastActivityByDealId: Record<string, string | null>;
  // Per-deal severity preview (from cached_outputs/*-review.json) for
  // the xl glyph strip. May be missing for deals without a cache.
  severityByDealId: Record<string, DealSeverityPreview | undefined>;
}

export function PipelineWorkspace({
  deals,
  lastActivityByDealId,
  severityByDealId,
}: PipelineWorkspaceProps) {
  const [state, setState] = useState<PipelineFilterState>(DEFAULT_FILTER_STATE);

  const filtered = useMemo(
    () => filterAndSort(deals, lastActivityByDealId, state),
    [deals, lastActivityByDealId, state],
  );

  const hasActiveFilters =
    state.stages.length > 0 ||
    state.search.trim().length > 0 ||
    state.view !== "default" ||
    state.sort !== "display_order";

  return (
    <>
      <PipelineToolbar
        state={state}
        onChange={setState}
        totalDeals={deals.length}
        visibleDeals={filtered.length}
      />
      {filtered.length === 0 ? (
        <EmptyState onClear={() => setState(DEFAULT_FILTER_STATE)} />
      ) : (
        <PipelineTable
          deals={filtered}
          lastActivityByDealId={lastActivityByDealId}
          severityByDealId={severityByDealId}
        />
      )}
      {hasActiveFilters && filtered.length > 0 ? (
        <div className="mx-auto mt-3 flex w-full max-w-6xl items-center justify-between px-4 text-[11px] text-muted-foreground sm:px-6">
          <span>
            Showing <span className="font-mono tabular-nums">{filtered.length}</span> of{" "}
            <span className="font-mono tabular-nums">{deals.length}</span> deals
          </span>
          <button
            type="button"
            onClick={() => setState(DEFAULT_FILTER_STATE)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition hover:bg-surface-hover hover:text-foreground"
          >
            Clear filters
            <X className="h-3 w-3" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      ) : null}
    </>
  );
}

// ---- Toolbar ----------------------------------------------------------

function PipelineToolbar({
  state,
  onChange,
  totalDeals,
  visibleDeals,
}: {
  state: PipelineFilterState;
  onChange: (next: PipelineFilterState) => void;
  totalDeals: number;
  visibleDeals: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-secondary px-3 py-1.5 sm:px-6">
      <Dropdown
        label={
          <span className="font-medium text-foreground">
            {viewLabel(state.view)}
          </span>
        }
        ariaLabel="Switch view"
      >
        {(close) =>
          (["default", "heroes", "closed_won"] as PipelineView[]).map((v) => (
            <DropdownRadioItem
              key={v}
              checked={state.view === v}
              onSelect={() => {
                onChange({ ...state, view: v });
                close();
              }}
            >
              {viewLabel(v)}
            </DropdownRadioItem>
          ))
        }
      </Dropdown>
      <Separator />
      <span className="hidden whitespace-nowrap text-[12px] text-muted-foreground sm:inline">
        <span className="font-mono tabular-nums">{visibleDeals}</span>
        {visibleDeals !== totalDeals && (
          <span className="text-muted-foreground/70">
            {" "}/ <span className="font-mono tabular-nums">{totalDeals}</span>
          </span>
        )}{" "}
        deals
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1">
        <SearchInput
          value={state.search}
          onChange={(search) => onChange({ ...state, search })}
        />
        <Dropdown
          icon={FilterIcon}
          label={
            <>
              Stage:{" "}
              <span className="font-medium text-foreground">
                {state.stages.length === 0
                  ? "All"
                  : state.stages.length === 1
                    ? stageLabel(state.stages[0])
                    : `${state.stages.length} selected`}
              </span>
            </>
          }
          ariaLabel="Filter by stage"
        >
          {() => (
            <>
              {state.stages.length > 0 && (
                <DropdownButton
                  onClick={() => onChange({ ...state, stages: [] })}
                >
                  Clear
                </DropdownButton>
              )}
              {STAGE_VALUES.map((s) => (
                <DropdownCheckboxItem
                  key={s}
                  checked={state.stages.includes(s)}
                  onSelect={() => {
                    const has = state.stages.includes(s);
                    onChange({
                      ...state,
                      stages: has
                        ? state.stages.filter((x) => x !== s)
                        : [...state.stages, s],
                    });
                  }}
                >
                  {stageLabel(s)}
                </DropdownCheckboxItem>
              ))}
            </>
          )}
        </Dropdown>
        <Dropdown
          icon={ArrowUpDown}
          label={
            <>
              Sort:{" "}
              <span className="font-medium text-foreground">
                {sortLabel(state.sort)}
              </span>
            </>
          }
          ariaLabel="Sort deals"
        >
          {(close) =>
            (
              [
                "display_order",
                "acv_desc",
                "term_desc",
                "last_activity_desc",
              ] as PipelineSort[]
            ).map((s) => (
              <DropdownRadioItem
                key={s}
                checked={state.sort === s}
                onSelect={() => {
                  onChange({ ...state, sort: s });
                  close();
                }}
              >
                {sortLabel(s)}
              </DropdownRadioItem>
            ))
          }
        </Dropdown>
      </div>
    </div>
  );
}

function Separator() {
  return (
    <span aria-hidden className="hidden h-3.5 w-px bg-border sm:inline-block" />
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  // Cmd/Ctrl-K focuses the search box. Pure quality-of-life affordance.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
        strokeWidth={1.75}
        aria-hidden
      />
      <input
        ref={ref}
        type="text"
        placeholder="Search deals…"
        aria-label="Search deals"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-36 rounded border border-border bg-card pl-6 pr-2 text-[12px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30 sm:w-44"
      />
      {value.length > 0 && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-1 top-1/2 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition hover:bg-surface-hover hover:text-foreground"
        >
          <X className="h-2.5 w-2.5" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

// ---- Dropdown primitive ----------------------------------------------

// Tiny click-outside dropdown. Rendered absolutely below its trigger,
// closes on outside click and ESC. No portal, no positioning logic
// beyond left-align — sufficient for the toolbar context.
function Dropdown({
  label,
  icon: Icon,
  ariaLabel,
  children,
}: {
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  ariaLabel: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded border border-transparent px-2 text-[12px] text-muted-foreground transition hover:border-border hover:bg-surface-hover hover:text-foreground"
      >
        {Icon && (
          <Icon className="h-3 w-3" strokeWidth={1.75} aria-hidden />
        )}
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown
          className="h-3 w-3 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 min-w-[180px] rounded-md border border-border bg-card py-1 shadow-md">
          {children(close)}
        </div>
      )}
    </div>
  );
}

function DropdownRadioItem({
  checked,
  onSelect,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-foreground transition hover:bg-surface-hover"
    >
      <span
        aria-hidden
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          checked ? "bg-[var(--brand)]" : "bg-transparent",
        )}
      />
      <span className="flex-1">{children}</span>
    </button>
  );
}

function DropdownCheckboxItem({
  checked,
  onSelect,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-foreground transition hover:bg-surface-hover"
    >
      <span
        className={cn(
          "inline-flex h-3.5 w-3.5 items-center justify-center rounded border",
          checked
            ? "border-[var(--brand)] bg-[var(--brand)] text-white"
            : "border-border bg-card text-transparent",
        )}
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
      </span>
      <span className="flex-1">{children}</span>
    </button>
  );
}

function DropdownButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full border-b border-border px-3 py-1 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground transition hover:bg-surface-hover hover:text-foreground"
    >
      {children}
    </button>
  );
}

// ---- Table -----------------------------------------------------------

const ROW_BASE =
  "flex items-center gap-3 px-3 py-2 transition sm:grid sm:grid-cols-[44px_minmax(0,1.4fr)_minmax(0,2fr)_88px_64px_104px] sm:gap-4 sm:px-6 lg:grid-cols-[44px_minmax(0,1.3fr)_minmax(0,1.7fr)_88px_64px_120px_104px_104px] xl:grid-cols-[44px_minmax(0,1.3fr)_minmax(0,1.6fr)_88px_88px_120px_104px_104px]";

function PipelineTable({
  deals,
  lastActivityByDealId,
  severityByDealId,
}: {
  deals: DealWithCustomer[];
  lastActivityByDealId: Record<string, string | null>;
  severityByDealId: Record<string, DealSeverityPreview | undefined>;
}) {
  return (
    <div className="border-y border-border">
      <PipelineHeader />
      <ul>
        {deals.map((deal, i) => (
          <li key={deal.id}>
            <PipelineRow
              deal={deal}
              rowNum={i + 1}
              striped={i % 2 === 1}
              lastActivity={lastActivityByDealId[deal.id] ?? null}
              severity={severityByDealId[deal.id]}
            />
          </li>
        ))}
      </ul>
    </div>
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
      <HeaderCell icon={LayoutList} className="hidden sm:flex">
        Deal
      </HeaderCell>
      <HeaderCell icon={DollarSign} align="right" className="hidden sm:flex">
        ACV
      </HeaderCell>
      <HeaderCell icon={Calendar} align="right" className="hidden sm:flex xl:hidden">
        Term
      </HeaderCell>
      <HeaderCell icon={Calendar} align="right" className="hidden xl:flex">
        Severity
      </HeaderCell>
      <HeaderCell className="hidden lg:flex">AE</HeaderCell>
      <HeaderCell align="right" className="hidden lg:flex">
        Last activity
      </HeaderCell>
      <HeaderCell align="right" className="ml-auto sm:ml-0">
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
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
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
      {Icon && (
        <Icon className="h-3 w-3" strokeWidth={1.75} aria-hidden />
      )}
      {children}
    </span>
  );
}

function PipelineRow({
  deal,
  rowNum,
  striped,
  lastActivity,
  severity,
}: {
  deal: DealWithCustomer;
  rowNum: number;
  striped: boolean;
  lastActivity: string | null;
  severity: DealSeverityPreview | undefined;
}) {
  const isStartHere = deal.scenario_meta?.is_recommended === 1;
  const tagline =
    deal.scenario_meta?.hero_tagline ??
    deal.discount_reason ??
    deal.competitive_context ??
    null;
  const muted =
    deal.stage === "closed_won" || deal.stage === "closed_lost";

  return (
    <Link
      href={`/deals/${deal.id}`}
      className={cn(
        ROW_BASE,
        "border-b border-border last:border-b-0 hover:bg-surface-hover",
        striped && !muted ? "bg-surface-secondary/40" : "",
        muted ? "opacity-90 hover:opacity-100" : "",
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
          <span className="truncate text-[12.5px] font-medium text-foreground">
            {deal.customer.name}
          </span>
          {deal.scenario_meta ? (
            <DifficultyBadge difficulty={deal.scenario_meta.difficulty_label} />
          ) : null}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground sm:hidden">
          {deal.name}
        </div>
      </div>
      <div className="hidden min-w-0 sm:block">
        <div className="truncate text-[12px] text-foreground">{deal.name}</div>
        {tagline ? (
          <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
            {tagline}
          </div>
        ) : null}
      </div>
      <div className="hidden text-right font-mono text-[12px] tabular-nums text-foreground sm:block">
        {formatACV(deal.acv)}
      </div>
      <div className="hidden text-right font-mono text-[11px] tabular-nums text-muted-foreground sm:block xl:hidden">
        {formatTerm(deal.term_months)}
      </div>
      <div className="hidden justify-end xl:flex">
        <SeverityStrip severity={severity} />
      </div>
      <div className="hidden lg:flex">
        <AeChip name={deal.ae_owner} />
      </div>
      <div className="hidden text-right font-mono text-[11px] tabular-nums text-muted-foreground lg:block">
        {formatRelative(lastActivity)}
      </div>
      <div className="ml-auto flex flex-shrink-0 justify-end sm:ml-0">
        <StageBadge stage={deal.stage} />
      </div>
    </Link>
  );
}

// AE owner chip — initials in a deterministic-color circle + truncated
// surname. Hash maps "Sarah Goldstein" → consistent color across renders.
function AeChip({ name }: { name: string }) {
  const initials = initialsOf(name);
  const colorIdx = hashCode(name) % AE_COLORS.length;
  const color = AE_COLORS[colorIdx];
  const surname = name.split(/\s+/).slice(-1)[0] ?? name;
  return (
    <div className="flex min-w-0 items-center gap-1.5" title={name}>
      <span
        aria-hidden
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8.5px] font-semibold text-white"
        style={{ backgroundColor: color }}
      >
        {initials}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">
        {surname}
      </span>
    </div>
  );
}

const AE_COLORS = [
  "#3B82F6",
  "#8B5CF6",
  "#F97316",
  "#10B981",
  "#14B8A6",
  "#EC4899",
  "#EAB308",
];
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// 3-glyph severity strip: approval depth · margin · redline.
// Empty cells render as a muted dash so the column reads at a glance.
function SeverityStrip({
  severity,
}: {
  severity: DealSeverityPreview | undefined;
}) {
  if (!severity) {
    return (
      <span className="text-[11px] text-muted-foreground/50" aria-hidden>
        —
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1" aria-label="Severity preview">
      <Glyph
        title={`Approval depth: ${severity.approverCount}`}
        tone={
          severity.approverCount >= 5
            ? "bad"
            : severity.approverCount >= 3
              ? "warn"
              : "good"
        }
      />
      <Glyph
        title={`Margin: ${severity.marginPct.toFixed(1)}%`}
        tone={
          severity.marginPct < 25
            ? "bad"
            : severity.marginPct < 30
              ? "warn"
              : "good"
        }
      />
      <Glyph
        title={`Redline: ${severity.redlinePriority}`}
        tone={
          severity.redlinePriority === "block" ||
          severity.redlinePriority === "high"
            ? "bad"
            : severity.redlinePriority === "medium"
              ? "warn"
              : "good"
        }
      />
    </div>
  );
}
function Glyph({ title, tone }: { title: string; tone: "good" | "warn" | "bad" }) {
  const cls =
    tone === "bad"
      ? "bg-red-500"
      : tone === "warn"
        ? "bg-amber-500"
        : "bg-emerald-500";
  return (
    <span
      title={title}
      className={cn("inline-block h-1.5 w-1.5 rounded-full", cls)}
    />
  );
}

// ---- Filter / sort logic --------------------------------------------

function filterAndSort(
  deals: DealWithCustomer[],
  lastActivityByDealId: Record<string, string | null>,
  state: PipelineFilterState,
): DealWithCustomer[] {
  let out = deals;

  if (state.view === "heroes") {
    out = out.filter((d) => d.is_scenario === 1);
  } else if (state.view === "closed_won") {
    out = out.filter((d) => d.stage === "closed_won");
  }

  if (state.stages.length > 0) {
    const set = new Set<Stage>(state.stages);
    out = out.filter((d) => set.has(d.stage));
  }

  const q = state.search.trim().toLowerCase();
  if (q.length > 0) {
    out = out.filter(
      (d) =>
        d.customer.name.toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q),
    );
  }

  const sorted = [...out];
  switch (state.sort) {
    case "acv_desc":
      sorted.sort((a, b) => b.acv - a.acv);
      break;
    case "term_desc":
      sorted.sort((a, b) => b.term_months - a.term_months);
      break;
    case "last_activity_desc":
      sorted.sort((a, b) => {
        const aT = lastActivityByDealId[a.id] ?? "";
        const bT = lastActivityByDealId[b.id] ?? "";
        return aT < bT ? 1 : aT > bT ? -1 : 0;
      });
      break;
    case "display_order":
    default:
      sorted.sort((a, b) => {
        const heroBoostA = a.is_scenario === 1 ? 0 : 1;
        const heroBoostB = b.is_scenario === 1 ? 0 : 1;
        if (heroBoostA !== heroBoostB) return heroBoostA - heroBoostB;
        return (
          (a.scenario_meta?.display_order ?? 99) -
          (b.scenario_meta?.display_order ?? 99)
        );
      });
  }

  return sorted;
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="mx-auto mt-6 w-full max-w-md rounded-md border border-dashed border-border bg-card px-4 py-6 text-center sm:px-6">
      <p className="text-[13px] font-medium text-foreground">
        No deals match those filters
      </p>
      <p className="mt-1 text-[11.5px] text-muted-foreground">
        Try clearing the filter or stage selection.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-3 inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[11.5px] font-medium text-foreground transition hover:bg-surface-hover"
      >
        Clear filters
      </button>
    </div>
  );
}
