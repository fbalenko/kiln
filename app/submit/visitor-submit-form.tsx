"use client";

import { useId, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DEAL_TYPE_VALUES,
  NON_STANDARD_CLAUSE_LABELS,
  NON_STANDARD_CLAUSE_VALUES,
  PRICING_MODEL_VALUES,
  SEGMENT_VALUES,
  VisitorSubmitSchema,
  type VisitorSubmitInput,
} from "@/lib/visitor-submit/schema";
import {
  formatDealType,
  formatSegment,
} from "@/lib/format";

type FieldErrors = Partial<Record<keyof VisitorSubmitInput, string>> & {
  _form?: string;
};

const PRICING_MODEL_LABELS: Record<(typeof PRICING_MODEL_VALUES)[number], string> = {
  subscription: "Subscription",
  usage_based: "Usage-based",
  hybrid: "Hybrid",
  one_time: "One-time",
};

interface FormState {
  customer_name: string;
  customer_domain: string;
  segment: (typeof SEGMENT_VALUES)[number] | "";
  deal_type: (typeof DEAL_TYPE_VALUES)[number] | "";
  pricing_model: (typeof PRICING_MODEL_VALUES)[number] | "";
  acv: string;
  term_months: string;
  discount_pct: number;
  discount_reason: string;
  non_standard_clauses: (typeof NON_STANDARD_CLAUSE_VALUES)[number][];
  customer_request: string;
  competitive_context: string;
}

const INITIAL: FormState = {
  customer_name: "",
  customer_domain: "",
  segment: "",
  deal_type: "",
  pricing_model: "",
  acv: "",
  term_months: "12",
  discount_pct: 15,
  discount_reason: "",
  non_standard_clauses: [],
  customer_request: "",
  competitive_context: "",
};

export function VisitorSubmitForm() {
  const [state, setState] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const requestCharCount = state.customer_request.length;
  const reasonCharCount = state.discount_reason.length;
  const competitiveCharCount = state.competitive_context.length;

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
    if (errors[key as keyof VisitorSubmitInput]) {
      setErrors((e) => ({ ...e, [key]: undefined }));
    }
  };

  const toggleClause = (clause: (typeof NON_STANDARD_CLAUSE_VALUES)[number]) => {
    setField(
      "non_standard_clauses",
      state.non_standard_clauses.includes(clause)
        ? state.non_standard_clauses.filter((c) => c !== clause)
        : [...state.non_standard_clauses, clause],
    );
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;

    const acvNum = state.acv.trim() === "" ? NaN : Number(state.acv);
    const termNum =
      state.term_months.trim() === "" ? NaN : Number(state.term_months);

    const candidate = {
      customer_name: state.customer_name,
      customer_domain: state.customer_domain || undefined,
      segment: state.segment || undefined,
      deal_type: state.deal_type || undefined,
      pricing_model: state.pricing_model || undefined,
      acv: Number.isFinite(acvNum) ? acvNum : undefined,
      term_months: Number.isFinite(termNum) ? termNum : undefined,
      discount_pct: state.discount_pct,
      discount_reason: state.discount_reason || undefined,
      non_standard_clauses: state.non_standard_clauses,
      customer_request: state.customer_request,
      competitive_context: state.competitive_context || undefined,
    };

    const parsed = VisitorSubmitSchema.safeParse(candidate);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as keyof VisitorSubmitInput | undefined;
        if (k && !(k in next)) next[k] = issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch("/api/submit-deal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const txt = await res.text();
        setErrors({
          _form: `Submission failed (${res.status}). ${txt.slice(0, 200)}`,
        });
        setSubmitting(false);
        return;
      }
      const data = (await res.json()) as { dealId?: string };
      if (!data.dealId) {
        setErrors({ _form: "Submission accepted but no deal id returned." });
        setSubmitting(false);
        return;
      }
      // Hard navigation so the deal page server-renders fresh (cookie
      // check + auto-start path runs on the server). A client-side
      // router.push would trigger the /pipeline intercepting modal,
      // which is the wrong surface for a visitor's own submission.
      window.location.href = `/deals/${data.dealId}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrors({ _form: `Network error: ${msg}` });
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-7">
      <Section title="Customer">
        <Field
          label="Customer name"
          required
          error={errors.customer_name}
          htmlFor="customer_name"
        >
          <Input
            id="customer_name"
            name="customer_name"
            value={state.customer_name}
            maxLength={80}
            placeholder="Acme Robotics, Stripe, Tessera Health…"
            onChange={(e) => setField("customer_name", e.target.value)}
            aria-invalid={Boolean(errors.customer_name)}
          />
        </Field>
        <Field
          label="Domain"
          hint="Optional. Used for live customer-signal lookup when it matches a real company."
          error={errors.customer_domain}
          htmlFor="customer_domain"
        >
          <Input
            id="customer_domain"
            name="customer_domain"
            value={state.customer_domain}
            placeholder="acme.io"
            onChange={(e) => setField("customer_domain", e.target.value)}
            aria-invalid={Boolean(errors.customer_domain)}
          />
        </Field>
        <Field label="Segment" required error={errors.segment}>
          <RadioRow
            name="segment"
            value={state.segment}
            options={SEGMENT_VALUES.map((v) => ({
              value: v,
              label: formatSegment(v),
            }))}
            onChange={(v) => setField("segment", v as FormState["segment"])}
          />
        </Field>
      </Section>

      <Section title="Deal shape">
        <Field label="Deal type" required error={errors.deal_type}>
          <RadioRow
            name="deal_type"
            value={state.deal_type}
            options={DEAL_TYPE_VALUES.map((v) => ({
              value: v,
              label: formatDealType(v),
            }))}
            onChange={(v) => setField("deal_type", v as FormState["deal_type"])}
          />
        </Field>
        <Field label="Pricing model" required error={errors.pricing_model}>
          <RadioRow
            name="pricing_model"
            value={state.pricing_model}
            options={PRICING_MODEL_VALUES.map((v) => ({
              value: v,
              label: PRICING_MODEL_LABELS[v],
            }))}
            onChange={(v) =>
              setField("pricing_model", v as FormState["pricing_model"])
            }
          />
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Annual contract value"
            required
            hint="Whole dollars, $1K to $10M."
            error={errors.acv}
            htmlFor="acv"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[12.5px] text-muted-foreground">
                $
              </span>
              <Input
                id="acv"
                name="acv"
                inputMode="numeric"
                value={state.acv}
                placeholder="250000"
                onChange={(e) =>
                  setField("acv", e.target.value.replace(/[^\d]/g, ""))
                }
                aria-invalid={Boolean(errors.acv)}
              />
            </div>
          </Field>
          <Field
            label="Term"
            required
            hint="Months (1–84)."
            error={errors.term_months}
            htmlFor="term_months"
          >
            <div className="flex items-center gap-2">
              <Input
                id="term_months"
                name="term_months"
                inputMode="numeric"
                value={state.term_months}
                placeholder="12"
                onChange={(e) =>
                  setField(
                    "term_months",
                    e.target.value.replace(/[^\d]/g, ""),
                  )
                }
                aria-invalid={Boolean(errors.term_months)}
              />
              <span className="font-mono text-[12.5px] text-muted-foreground">
                mo
              </span>
            </div>
          </Field>
        </div>
        <Field
          label="Discount"
          hint="Drag to set the proposed discount off list."
          error={errors.discount_pct}
        >
          <DiscountSlider
            value={state.discount_pct}
            onChange={(v) => setField("discount_pct", v)}
          />
        </Field>
        <Field
          label="Discount reason"
          hint="Optional. What's driving the requested discount? Volume commit, multi-year, competitive pressure…"
          error={errors.discount_reason}
          htmlFor="discount_reason"
          counter={{ value: reasonCharCount, max: 400 }}
        >
          <Textarea
            id="discount_reason"
            name="discount_reason"
            rows={2}
            maxLength={400}
            value={state.discount_reason}
            placeholder="3-yr commit + competitive replacement of incumbent."
            onChange={(e) => setField("discount_reason", e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Risk surface">
        <Field
          label="Non-standard clauses"
          hint="Tap any clauses the customer is asking for that fall outside Clay's paper. Used by the redline + approval agents."
          error={errors.non_standard_clauses}
        >
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {NON_STANDARD_CLAUSE_VALUES.map((clause) => {
              const checked = state.non_standard_clauses.includes(clause);
              return (
                <button
                  type="button"
                  key={clause}
                  onClick={() => toggleClause(clause)}
                  aria-pressed={checked}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-[12px] transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30",
                    checked
                      ? "border-[var(--brand)]/40 bg-[var(--brand)]/[0.05] text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border",
                      checked
                        ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                        : "border-border bg-background",
                    )}
                  >
                    {checked ? (
                      <svg
                        viewBox="0 0 12 12"
                        className="h-2 w-2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="2.5 6.5 5 9 9.5 3.5" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="flex-1 leading-snug">
                    {NON_STANDARD_CLAUSE_LABELS[clause]}
                  </span>
                </button>
              );
            })}
          </div>
        </Field>
      </Section>

      <Section title="Narrative">
        <Field
          label="Customer request"
          required
          hint="What is the customer actually asking for, and why? 50–2000 chars."
          error={errors.customer_request}
          htmlFor="customer_request"
          counter={{ value: requestCharCount, max: 2000, min: 50 }}
        >
          <Textarea
            id="customer_request"
            name="customer_request"
            rows={6}
            maxLength={2000}
            value={state.customer_request}
            placeholder="Customer is consolidating from three vendors. They want a 3-year commit with quarterly true-up, a 25% discount tied to multi-year, and a custom security addendum to satisfy their CISO. Decision by end of quarter; competitive trial is running with a smaller vendor."
            onChange={(e) => setField("customer_request", e.target.value)}
            aria-invalid={Boolean(errors.customer_request)}
          />
        </Field>
        <Field
          label="Competitive context"
          hint="Optional. Who else is in the deal and what's the dynamic?"
          error={errors.competitive_context}
          htmlFor="competitive_context"
          counter={{ value: competitiveCharCount, max: 1000 }}
        >
          <Textarea
            id="competitive_context"
            name="competitive_context"
            rows={3}
            maxLength={1000}
            value={state.competitive_context}
            placeholder="Apollo is the incumbent. Customer flagged price as the primary blocker but is also asking for parity on data residency."
            onChange={(e) => setField("competitive_context", e.target.value)}
          />
        </Field>
      </Section>

      {errors._form ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"
        >
          {errors._form}
        </div>
      ) : null}

      <div className="sticky bottom-3 z-10 flex flex-col items-stretch gap-2 border-t border-border bg-background/95 pt-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11.5px] text-muted-foreground">
          Submission triggers a live agent run. Slack post lands in the
          demo workspace; expect under a minute end-to-end.
        </p>
        <Button
          type="submit"
          disabled={submitting}
          className="sm:w-auto sm:px-4"
        >
          {submitting ? "Submitting…" : "Submit & run review"}
          {!submitting ? <ArrowRight className="size-3.5" aria-hidden /> : null}
        </Button>
      </div>
    </form>
  );
}

// ---------- form primitives ------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-[11px] font-medium uppercase tracking-wider text-[var(--brand)]">
        {title}
      </legend>
      <div className="flex flex-col gap-4">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  required = false,
  hint,
  error,
  htmlFor,
  counter,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  htmlFor?: string;
  counter?: { value: number; max: number; min?: number };
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={htmlFor}
          className="text-[12.5px] font-medium text-foreground"
        >
          {label}
          {required ? (
            <span className="ml-1 text-destructive" aria-hidden>
              *
            </span>
          ) : null}
        </label>
        {counter ? (
          <span
            className={cn(
              "font-mono text-[10.5px] tabular-nums",
              counter.min !== undefined && counter.value < counter.min
                ? "text-amber-600"
                : counter.value > counter.max * 0.9
                  ? "text-amber-600"
                  : "text-muted-foreground",
            )}
          >
            {counter.value}
            {counter.min !== undefined ? `/${counter.min}+` : ""}
            {counter.min === undefined ? `/${counter.max}` : ""}
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p
          role="alert"
          className="text-[11.5px] leading-snug text-destructive"
        >
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function RadioRow({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "h-8 rounded-md border px-3 text-[12px] font-medium transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30",
              active
                ? "border-[var(--brand)] bg-[var(--brand)]/[0.07] text-[var(--brand)]"
                : "border-border bg-card text-muted-foreground hover:bg-surface-hover hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function DiscountSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  // Native <input type="range"> rather than the shared shadcn Slider:
  // the wrapper renders Slider.Thumb without an `index` prop, which
  // breaks single-thumb mode (and falls back to a two-thumb [min,max]
  // when given a number instead of an array). Native range gives us
  // controlled value, touch support, and accessibility for free.
  const tone = useMemo(() => {
    if (value >= 30) return "text-red-600";
    if (value >= 20) return "text-amber-600";
    return "text-foreground";
  }, [value]);

  const inputId = useId();
  const pct = (value / 60) * 100;
  // Two-stop gradient on the track: brand-blue up to the thumb, muted
  // beyond. Stays in sync with the controlled `value`.
  const trackStyle = {
    background: `linear-gradient(to right, var(--brand) 0%, var(--brand) ${pct}%, hsl(var(--muted)) ${pct}%, hsl(var(--muted)) 100%)`,
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "font-mono text-[18px] font-semibold leading-none tabular-nums",
              tone,
            )}
          >
            {value}
          </span>
          <span className="font-mono text-[12px] text-muted-foreground">%</span>
        </div>
        <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
          0% — 60%
        </span>
      </div>
      <input
        id={inputId}
        type="range"
        min={0}
        max={60}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Discount percent"
        aria-valuetext={`${value} percent`}
        style={trackStyle}
        className={cn(
          "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted touch-none",
          // Webkit thumb
          "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4",
          "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[var(--brand)]",
          "[&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-grab",
          "[&::-webkit-slider-thumb]:transition-transform active:[&::-webkit-slider-thumb]:scale-110",
          // Firefox thumb
          "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full",
          "[&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[var(--brand)] [&::-moz-range-thumb]:bg-white",
          "[&::-moz-range-thumb]:cursor-grab",
          // Focus ring on the thumb
          "focus-visible:outline-none [&::-webkit-slider-thumb]:focus-visible:ring-2 [&::-webkit-slider-thumb]:focus-visible:ring-[var(--brand)]/30",
        )}
      />
    </div>
  );
}
