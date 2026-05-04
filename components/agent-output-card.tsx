"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";
import type { PricingOutput } from "@/lib/agents/schemas";

// Renders a (possibly partial) PricingOutput. Each section is conditionally
// mounted as fields arrive over the SSE stream — the fade-in is a tiny CSS
// animation rather than a JS spring, so partial → full transitions feel calm.

type PartialPricing = Partial<PricingOutput> & {
  _meta?: {
    from_cache?: boolean;
    duration_ms?: number;
    input_tokens?: number | null;
    output_tokens?: number | null;
  };
};

export function AgentOutputCard({ output }: { output: PartialPricing }) {
  const hasHeadline =
    typeof output.list_price === "number" &&
    typeof output.proposed_price === "number" &&
    typeof output.effective_discount_pct === "number" &&
    typeof output.margin_pct_estimate === "number";

  return (
    <div className="space-y-4 rounded-md border border-border bg-card p-4 sm:p-5">
      {hasHeadline && (
        <HeadlineNumbers
          listPrice={output.list_price as number}
          proposedPrice={output.proposed_price as number}
          discountPct={output.effective_discount_pct as number}
          marginPct={output.margin_pct_estimate as number}
        />
      )}

      {output.guardrail_evaluations &&
        output.guardrail_evaluations.length > 0 && (
          <GuardrailSection evaluations={output.guardrail_evaluations} />
        )}

      {output.alternative_structures &&
        output.alternative_structures.length > 0 && (
          <AlternativesSection alternatives={output.alternative_structures} />
        )}

      {(output.reasoning_summary || output.confidence) && (
        <SummaryFooter
          summary={output.reasoning_summary}
          confidence={output.confidence}
          similarRefs={output.similar_deal_references}
          ltv={output.ltv_estimate_under_usage_assumptions ?? null}
          meta={output._meta}
        />
      )}
    </div>
  );
}

function HeadlineNumbers({
  listPrice,
  proposedPrice,
  discountPct,
  marginPct,
}: {
  listPrice: number;
  proposedPrice: number;
  discountPct: number;
  marginPct: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <Stat label="List price" value={formatMoney(listPrice)} />
      <Stat label="Proposed" value={formatMoney(proposedPrice)} />
      <Stat
        label="Effective discount"
        value={`${discountPct.toFixed(1)}%`}
        tone={discountPct >= 25 ? "warn" : "neutral"}
      />
      <Stat
        label="Est. gross margin"
        value={`${marginPct.toFixed(1)}%`}
        tone={marginPct < 25 ? "block" : marginPct < 40 ? "warn" : "neutral"}
        sub="@ 40% list-price baseline"
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "warn" | "block";
}) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-base font-medium tabular-nums",
          tone === "warn" && "text-amber-700 dark:text-amber-400",
          tone === "block" && "text-red-700 dark:text-red-400",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}

function GuardrailSection({
  evaluations,
}: {
  evaluations: NonNullable<PartialPricing["guardrail_evaluations"]>;
}) {
  return (
    <div className="space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <SectionHeader
        title="Guardrails"
        subtitle={`${evaluations.filter((e) => e.passed).length} of ${evaluations.length} passed`}
      />
      <ul className="space-y-1.5">
        {evaluations.map((g, i) => (
          <li
            key={`${g.rule_name}-${i}`}
            className="flex items-start gap-2.5 rounded-md border border-border bg-background px-3 py-2"
          >
            <span
              className={cn(
                "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                g.passed
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                  : severityChipBg(g.severity),
              )}
            >
              {g.passed ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-medium text-foreground">
                  {g.rule_name}
                </span>
                <SeverityBadge severity={g.severity} />
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {g.explanation}
              </div>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                actual {formatNumberLoose(g.actual_value)} · threshold{" "}
                {formatNumberLoose(g.threshold_value)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AlternativesSection({
  alternatives,
}: {
  alternatives: NonNullable<PartialPricing["alternative_structures"]>;
}) {
  return (
    <div className="space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <SectionHeader
        title="Alternative structures"
        subtitle={`${alternatives.length} proposed`}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        {alternatives.map((a, i) => (
          <div
            key={i}
            className="rounded-md border border-border bg-background p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-[13px] font-medium text-foreground">
                {a.label}
              </div>
              <Badge variant="outline" className="font-mono tabular-nums">
                {a.expected_acv_impact >= 0 ? "+" : ""}
                {formatMoney(a.expected_acv_impact)}
              </Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {a.description}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
              <MiniStat label="price" value={formatMoney(a.proposed_price)} />
              <MiniStat
                label="disc"
                value={`${a.effective_discount_pct.toFixed(1)}%`}
              />
              <MiniStat
                label="margin"
                value={`${a.margin_pct_estimate.toFixed(1)}%`}
              />
            </div>
            <div className="mt-2 border-t border-border pt-2 text-xs leading-relaxed text-foreground/80">
              {a.rationale}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}

function SummaryFooter({
  summary,
  confidence,
  similarRefs,
  ltv,
  meta,
}: {
  summary?: string;
  confidence?: PricingOutput["confidence"];
  similarRefs?: string[];
  ltv: number | null;
  meta?: PartialPricing["_meta"];
}) {
  return (
    <div className="space-y-2 border-t border-border pt-3 animate-in fade-in duration-300">
      {summary && (
        <p className="text-[13px] leading-relaxed text-foreground/90">
          {summary}
        </p>
      )}
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
        {ltv != null && <span>LTV est. {formatMoney(ltv)}</span>}
        {similarRefs && similarRefs.length > 0 && (
          <span>{similarRefs.length} precedent(s)</span>
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
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      {subtitle && (
        <span className="text-[11px] text-muted-foreground">{subtitle}</span>
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const label =
    severity === "block_absolute"
      ? "block (absolute)"
      : severity === "block_without_approval"
        ? "needs approval"
        : severity;
  return (
    <span
      className={cn(
        "inline-flex h-4 items-center rounded-sm px-1.5 text-[10px] font-medium uppercase tracking-wider",
        severityChipBg(severity),
      )}
    >
      {label}
    </span>
  );
}

function severityChipBg(severity: string): string {
  switch (severity) {
    case "block_absolute":
      return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400";
    case "block_without_approval":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400";
    case "warn":
      return "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  }
  return `${sign}$${abs.toLocaleString()}`;
}

function formatNumberLoose(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2);
}
