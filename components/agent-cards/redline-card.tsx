"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RedlineOutput } from "@/lib/agents/schemas";

type Partial = globalThis.Partial<RedlineOutput> & { _meta?: AgentMeta };

interface AgentMeta {
  from_cache?: boolean;
  duration_ms?: number;
  input_tokens?: number | null;
  output_tokens?: number | null;
}

export function RedlineCard({ output }: { output: Partial }) {
  return (
    <div className="space-y-4">
      {output.overall_redline_priority && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Overall priority
          </div>
          <PriorityBadge priority={output.overall_redline_priority} />
        </div>
      )}

      {output.one_line_summary && (
        <p className="rounded-md border border-border bg-background px-3 py-2 text-[13px] leading-relaxed text-foreground/90">
          {output.one_line_summary}
        </p>
      )}

      {output.flagged_clauses && output.flagged_clauses.length > 0 && (
        <Section
          title="Flagged clauses"
          subtitle={`${output.flagged_clauses.length} requiring redline`}
        >
          <ul className="space-y-1.5">
            {output.flagged_clauses.map((c, i) => (
              <FlaggedClause key={`${c.clause_type}-${i}`} clause={c} />
            ))}
          </ul>
        </Section>
      )}

      {output.standard_clauses_affirmed &&
        output.standard_clauses_affirmed.length > 0 && (
          <Section
            title="Standard clauses affirmed"
            subtitle={`${output.standard_clauses_affirmed.length}`}
          >
            <div className="flex flex-wrap gap-1.5">
              {output.standard_clauses_affirmed.map((c, i) => (
                <Badge
                  key={`${c}-${i}`}
                  variant="outline"
                  className="text-[10px]"
                >
                  {c}
                </Badge>
              ))}
            </div>
          </Section>
        )}

      {(output.reasoning_summary || output.confidence) && (
        <div className="space-y-2 border-t border-border pt-3 animate-in fade-in duration-300">
          {output.reasoning_summary && (
            <p className="text-[13px] leading-relaxed text-foreground/90">
              {output.reasoning_summary}
            </p>
          )}
          <MetaLine confidence={output.confidence} meta={output._meta} />
        </div>
      )}
    </div>
  );
}

function FlaggedClause({
  clause,
}: {
  clause: NonNullable<RedlineOutput["flagged_clauses"]>[number];
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-md border border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2.5 px-3 py-2 text-left"
      >
        <span className="mt-0.5 text-muted-foreground">
          {open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] text-foreground">
              {clause.clause_type}
            </span>
            <RiskChip level={clause.risk_level} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {clause.customer_proposed_language}
          </div>
        </div>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border bg-surface-secondary px-3 py-2 text-xs text-foreground/80">
          <Field label="Risk explanation">{clause.risk_explanation}</Field>
          <Field label="Suggested counter">{clause.suggested_counter}</Field>
          <Field label="Fallback position">{clause.fallback_position}</Field>
          {clause.precedent_notes && (
            <Field label="Precedent">{clause.precedent_notes}</Field>
          )}
        </div>
      )}
    </li>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 leading-relaxed">{children}</div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        {subtitle && (
          <span className="text-[11px] text-muted-foreground">{subtitle}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function RiskChip({ level }: { level: string }) {
  const tone =
    level === "high"
      ? "bg-red-100 text-red-700"
      : level === "medium"
        ? "bg-amber-50 text-amber-700"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex h-4 items-center rounded-sm px-1.5 text-[10px] font-medium uppercase tracking-wider",
        tone,
      )}
    >
      {level}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const tone =
    priority === "block"
      ? "bg-red-100 text-red-700"
      : priority === "high"
        ? "bg-amber-100 text-amber-800"
        : priority === "medium"
          ? "bg-amber-50 text-amber-700"
          : "bg-emerald-50 text-emerald-700";
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-sm px-2 text-[11px] font-medium uppercase tracking-wider",
        tone,
      )}
    >
      {priority}
    </span>
  );
}

function MetaLine({
  confidence,
  meta,
}: {
  confidence?: RedlineOutput["confidence"];
  meta?: AgentMeta;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {confidence && (
        <span className="inline-flex items-center gap-1">
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              confidence === "high" && "bg-emerald-500",
              confidence === "medium" && "bg-amber-500",
              confidence === "low" && "bg-red-500",
            )}
          />
          {confidence} confidence
        </span>
      )}
      {meta?.from_cache && <span>· cached</span>}
      {meta && typeof meta.duration_ms === "number" && (
        <span>· {(meta.duration_ms / 1000).toFixed(1)}s</span>
      )}
    </div>
  );
}
