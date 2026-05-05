"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ApprovalOutput } from "@/lib/agents/schemas";
import { ChevronRight } from "lucide-react";

type Partial = globalThis.Partial<ApprovalOutput> & { _meta?: AgentMeta };

interface AgentMeta {
  from_cache?: boolean;
  duration_ms?: number;
  input_tokens?: number | null;
  output_tokens?: number | null;
}

export function ApprovalCard({ output }: { output: Partial }) {
  return (
    <div className="space-y-4">
      {output.one_line_summary && (
        <p className="rounded-md border border-border bg-background px-3 py-2 text-[13px] leading-relaxed text-foreground/90">
          {output.one_line_summary}
        </p>
      )}

      {output.approval_chain && output.approval_chain.length > 0 && (
        <Section
          title="Approval chain"
          subtitle={
            typeof output.expected_cycle_time_business_days === "number"
              ? `~${output.expected_cycle_time_business_days} business days`
              : undefined
          }
        >
          <ChainVisualization chain={output.approval_chain} />
        </Section>
      )}

      {output.required_approvers && output.required_approvers.length > 0 && (
        <Section
          title="Required approvers"
          subtitle={`${output.required_approvers.length} roles`}
        >
          <ul className="space-y-1.5">
            {output.required_approvers.map((a, i) => (
              <li
                key={`${a.role}-${i}`}
                className="rounded-md border border-border bg-background px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-medium text-foreground">
                    {a.role}
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {a.rule_triggered}
                  </Badge>
                </div>
                <div className="mt-1 text-xs leading-relaxed text-foreground/80">
                  {a.rationale}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {output.blockers_to_address_first &&
        output.blockers_to_address_first.length > 0 && (
          <Section title="Blockers — fix before submitting">
            <ul className="space-y-1">
              {output.blockers_to_address_first.map((b, i) => (
                <li
                  key={i}
                  className="rounded-md border border-amber-300 bg-amber-50/50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
                >
                  {b}
                </li>
              ))}
            </ul>
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

function ChainVisualization({
  chain,
}: {
  chain: NonNullable<ApprovalOutput["approval_chain"]>;
}) {
  // Group by step number — entries with the same step display side-by-side.
  const grouped = new Map<number, typeof chain>();
  for (const node of chain) {
    if (!grouped.has(node.step)) grouped.set(node.step, [] as typeof chain);
    grouped.get(node.step)!.push(node);
  }
  const ordered = [...grouped.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div className="flex flex-wrap items-stretch gap-1">
      {ordered.map(([step, nodes], i) => (
        <div key={step} className="flex items-center gap-1">
          <div className="flex flex-col gap-1">
            {nodes.map((n, j) => (
              <div
                key={`${n.approver_role}-${j}`}
                className={cn(
                  "rounded-md border bg-background px-2.5 py-1.5",
                  n.can_veto ? "border-amber-300" : "border-border",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {step}
                  </span>
                  <span className="text-[12px] font-medium text-foreground">
                    {n.approver_role}
                  </span>
                  {n.can_veto && (
                    <span className="inline-flex h-3.5 items-center rounded-sm bg-amber-100 px-1 text-[9px] font-medium uppercase tracking-wider text-amber-800">
                      veto
                    </span>
                  )}
                </div>
                {n.parallel_with.length > 0 && (
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    parallel: {n.parallel_with.join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>
          {i < ordered.length - 1 && (
            <ChevronRight
              className="h-3 w-3 shrink-0 text-muted-foreground"
              aria-hidden
            />
          )}
        </div>
      ))}
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

function MetaLine({
  confidence,
  meta,
}: {
  confidence?: ApprovalOutput["confidence"];
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
