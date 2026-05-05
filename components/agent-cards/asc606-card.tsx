"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Asc606Output } from "@/lib/agents/schemas";

type Partial = globalThis.Partial<Asc606Output> & { _meta?: AgentMeta };

interface AgentMeta {
  from_cache?: boolean;
  duration_ms?: number;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cost_usd?: number | null;
}

export function Asc606Card({ output }: { output: Partial }) {
  return (
    <div className="space-y-4">
      {output.performance_obligations && output.performance_obligations.length > 0 && (
        <Section title="Performance obligations" subtitle={`${output.performance_obligations.length} identified`}>
          <ul className="space-y-1.5">
            {output.performance_obligations.map((po, i) => (
              <li
                key={`${po.name}-${i}`}
                className="rounded-md border border-border bg-background px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-medium text-foreground">
                    {po.name}
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
                    {po.expected_recognition_pattern}
                  </Badge>
                  {po.is_distinct ? (
                    <span className="inline-flex h-4 items-center rounded-sm bg-emerald-50 px-1.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                      distinct
                    </span>
                  ) : (
                    <span className="inline-flex h-4 items-center rounded-sm bg-amber-50 px-1.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                      not distinct
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {po.description}
                </div>
                {typeof po.estimated_standalone_value === "number" && (
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                    SSP est. ${formatCompact(po.estimated_standalone_value)}
                  </div>
                )}
                <div className="mt-1.5 border-t border-border pt-1.5 text-xs leading-relaxed text-foreground/80">
                  {po.rationale}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {output.variable_consideration_flags &&
        output.variable_consideration_flags.length > 0 && (
          <Section
            title="Variable consideration"
            subtitle={`${output.variable_consideration_flags.length} sources`}
          >
            <ul className="space-y-1.5">
              {output.variable_consideration_flags.map((vc, i) => (
                <li
                  key={`${vc.source}-${i}`}
                  className="rounded-md border border-border bg-background px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] text-foreground">
                      {vc.source}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {vc.treatment_required}
                    </Badge>
                    <DifficultyBadge level={vc.estimation_difficulty} />
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-foreground/80">
                    {vc.explanation}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

      {output.contract_modification_risk && (
        <Section title="Contract modification risk">
          <div
            className={cn(
              "rounded-md border px-3 py-2",
              output.contract_modification_risk.is_at_risk
                ? "border-amber-300 bg-amber-50/50"
                : "border-border bg-background",
            )}
          >
            <div className="flex items-center gap-2 text-[13px] font-medium">
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 rounded-full",
                  output.contract_modification_risk.is_at_risk
                    ? "bg-amber-500"
                    : "bg-emerald-500",
                )}
              />
              {output.contract_modification_risk.is_at_risk
                ? "At risk"
                : "Not at risk"}
            </div>
            <div className="mt-1 text-xs leading-relaxed text-foreground/80">
              {output.contract_modification_risk.explanation}
            </div>
          </div>
        </Section>
      )}

      {output.recognized_revenue_schedule &&
        output.recognized_revenue_schedule.length > 0 && (
          <Section
            title="Revenue recognition schedule"
            subtitle={`${output.recognized_revenue_schedule.length} periods`}
          >
            <table className="w-full overflow-hidden rounded-md border border-border text-xs">
              <thead className="bg-surface-secondary text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Period</th>
                  <th className="px-3 py-1.5 text-right font-mono font-medium">
                    Amount
                  </th>
                  <th className="px-3 py-1.5 text-left font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {output.recognized_revenue_schedule.map((row, i) => (
                  <tr
                    key={`${row.period}-${i}`}
                    className="border-t border-border"
                  >
                    <td className="px-3 py-1.5 text-foreground">
                      {row.period}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-foreground tabular-nums">
                      ${formatCompact(row.amount)}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {row.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

      {output.red_flags && output.red_flags.length > 0 && (
        <Section
          title="Red flags"
          subtitle={`${output.red_flags.length} surfaced`}
        >
          <ul className="space-y-1.5">
            {output.red_flags.map((rf, i) => (
              <li
                key={`${rf.label}-${i}`}
                className="rounded-md border border-border bg-background px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <SeverityChip severity={rf.severity} />
                  <span className="text-[13px] font-medium text-foreground">
                    {rf.label}
                  </span>
                </div>
                <div className="mt-1 text-xs leading-relaxed text-foreground/80">
                  {rf.explanation}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(output.reasoning_summary || output.confidence) && (
        <SummaryFooter
          summary={output.reasoning_summary}
          confidence={output.confidence}
          meta={output._meta}
        />
      )}
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

function DifficultyBadge({ level }: { level: string }) {
  const tone =
    level === "high"
      ? "bg-red-50 text-red-700"
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

function SeverityChip({ severity }: { severity: string }) {
  const label =
    severity === "block_without_approval" ? "needs approval" : severity;
  const tone =
    severity === "block_without_approval"
      ? "bg-amber-100 text-amber-800"
      : severity === "warn"
        ? "bg-amber-50 text-amber-700"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex h-4 items-center rounded-sm px-1.5 text-[10px] font-medium uppercase tracking-wider",
        tone,
      )}
    >
      {label}
    </span>
  );
}

function SummaryFooter({
  summary,
  confidence,
  meta,
}: {
  summary?: string;
  confidence?: Asc606Output["confidence"];
  meta?: AgentMeta;
}) {
  return (
    <div className="space-y-2 border-t border-border pt-3 animate-in fade-in duration-300">
      {summary && (
        <p className="text-[13px] leading-relaxed text-foreground/90">
          {summary}
        </p>
      )}
      <MetaLine confidence={confidence} meta={meta} />
    </div>
  );
}

function MetaLine({
  confidence,
  meta,
}: {
  confidence?: Asc606Output["confidence"];
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
      {meta &&
        typeof meta.input_tokens === "number" &&
        typeof meta.output_tokens === "number" && (
          <span>
            · {meta.input_tokens.toLocaleString()} in /{" "}
            {meta.output_tokens.toLocaleString()} out tok
          </span>
        )}
    </div>
  );
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000)
    return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000)
    return `${sign}${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  return `${sign}${abs.toLocaleString()}`;
}
