import type { DealWithCustomer } from "@/lib/db/queries";
import {
  formatACV,
  formatDealType,
  formatSegment,
} from "@/lib/format";

// Compact deal-context column for the Mode 1 workbench layout. Same
// information as the prior <DealMetadata> 3-card grid, but stacked
// vertically and tightened for a 4-of-12 column rail.

export function DealContextRail({ deal }: { deal: DealWithCustomer }) {
  const clauses = deal.non_standard_clauses
    ? (JSON.parse(deal.non_standard_clauses) as string[])
    : [];
  const paymentLabel = deal.payment_terms.replace(/_/g, " ");

  return (
    <div className="space-y-3">
      <Card title="Customer">
        <Field label="Segment">{formatSegment(deal.customer.segment)}</Field>
        <Field label="Industry">{deal.customer.industry}</Field>
        <Field label="Employees">
          {deal.customer.employee_count.toLocaleString()}
        </Field>
        {deal.customer.health_score != null ? (
          <Field label="Health">{deal.customer.health_score} / 100</Field>
        ) : null}
      </Card>

      <Card title="Pricing">
        <Field label="Type">{formatDealType(deal.deal_type)}</Field>
        <Field label="List">{formatACV(deal.list_price)}</Field>
        <Field label="Proposed">{formatACV(deal.proposed_price)}</Field>
        <Field label="Discount">{deal.discount_pct.toFixed(1)}%</Field>
        <Field label="Payment">{paymentLabel}</Field>
      </Card>

      <Card title="Owners">
        <Field label="AE">{deal.ae_owner}</Field>
        <Field label="Manager">{deal.ae_manager}</Field>
        {deal.close_date ? (
          <Field label="Close date">{deal.close_date}</Field>
        ) : null}
        <Field label="Pricing model">
          {deal.pricing_model.replace(/_/g, " ")}
        </Field>
      </Card>

      <div className="rounded-md border border-border bg-card px-3 py-2.5">
        <h3 className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
          Customer request
        </h3>
        <p className="mt-1.5 whitespace-pre-line text-[12px] leading-relaxed text-foreground">
          {deal.customer_request}
        </p>
        {clauses.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {clauses.map((c) => (
              <span
                key={c}
                className="inline-flex items-center rounded-sm border border-border bg-surface-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </div>
        ) : null}
        {deal.competitive_context ? (
          <div className="mt-2.5 border-t border-border pt-2">
            <h4 className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
              Competitive context
            </h4>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
              {deal.competitive_context}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <h3 className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="mt-1.5 space-y-1">{children}</div>
    </div>
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
    <div className="flex items-baseline justify-between gap-3 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono tabular-nums text-foreground">
        {children}
      </span>
    </div>
  );
}
