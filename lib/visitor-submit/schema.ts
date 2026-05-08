import { z } from "zod";

// Zod schema for the /submit form. Mirrors the deal/customer columns the
// orchestrator reads (lib/db/queries.ts → DealWithCustomer) so a parsed
// result can be fed directly into the visitor insert path without
// adapter glue.
//
// Validation rules are deliberately lenient on the soft fields (domain,
// reason, competitive context) and strict on the hard fields (customer
// name, request body, ACV, term, discount). The brief explicitly cuts
// rate-limiting, but field-level validation still keeps the LLM input
// roughly bounded.

export const SEGMENT_VALUES = [
  "enterprise",
  "mid_market",
  "plg_self_serve",
] as const;

export const DEAL_TYPE_VALUES = [
  "new_logo",
  "expansion",
  "renewal",
  "partnership",
] as const;

export const PRICING_MODEL_VALUES = [
  "subscription",
  "usage_based",
  "hybrid",
  "one_time",
] as const;

// Ten common non-standard clauses surfaced as the multi-select on the
// form. Stored as a JSON array on `deals.non_standard_clauses` so the
// existing seed contract holds.
export const NON_STANDARD_CLAUSE_VALUES = [
  "mfn",
  "uncapped_liability",
  "ip_indemnity",
  "data_residency_eu",
  "audit_rights",
  "termination_for_convenience",
  "multi_year_price_lock",
  "custom_security_addendum",
  "source_code_escrow",
  "aggressive_sla",
] as const;

export const NON_STANDARD_CLAUSE_LABELS: Record<
  (typeof NON_STANDARD_CLAUSE_VALUES)[number],
  string
> = {
  mfn: "Most-favored-nation pricing",
  uncapped_liability: "Uncapped liability",
  ip_indemnity: "Broad IP indemnity",
  data_residency_eu: "EU data residency",
  audit_rights: "Customer audit rights",
  termination_for_convenience: "Termination for convenience",
  multi_year_price_lock: "Multi-year price lock",
  custom_security_addendum: "Custom security addendum",
  source_code_escrow: "Source code escrow",
  aggressive_sla: "Aggressive SLA / unlimited revisions",
};

// A tolerant domain shape — accepts plain hostnames (acme.io), URLs
// (https://acme.io/contact), and empty strings. We strip protocol +
// path on the server side before storing.
const DOMAIN_RE = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;

export const VisitorSubmitSchema = z.object({
  customer_name: z
    .string()
    .trim()
    .min(1, "Customer name is required.")
    .max(80, "Keep the customer name under 80 characters."),
  customer_domain: z
    .string()
    .trim()
    .max(120, "Domain is too long.")
    .optional()
    .transform((v) => (v ? v : undefined)),
  segment: z.enum(SEGMENT_VALUES, { message: "Pick a customer segment." }),
  deal_type: z.enum(DEAL_TYPE_VALUES, { message: "Pick a deal type." }),
  pricing_model: z.enum(PRICING_MODEL_VALUES, {
    message: "Pick a pricing model.",
  }),
  acv: z
    .number({ message: "ACV must be a number." })
    .int("ACV must be a whole number.")
    .min(1_000, "Minimum ACV is $1,000.")
    .max(10_000_000, "Maximum ACV is $10,000,000."),
  term_months: z
    .number({ message: "Term must be a number." })
    .int("Term must be whole months.")
    .min(1, "Minimum term is 1 month.")
    .max(84, "Maximum term is 84 months (7 yrs)."),
  discount_pct: z
    .number({ message: "Discount must be a number." })
    .min(0, "Minimum discount is 0%.")
    .max(60, "Maximum discount is 60%."),
  discount_reason: z
    .string()
    .trim()
    .max(400, "Keep the reason under 400 characters.")
    .optional()
    .transform((v) => (v ? v : undefined)),
  non_standard_clauses: z
    .array(z.enum(NON_STANDARD_CLAUSE_VALUES))
    .max(NON_STANDARD_CLAUSE_VALUES.length)
    .default([]),
  customer_request: z
    .string()
    .trim()
    .min(50, "Describe the deal in at least 50 characters.")
    .max(2000, "Keep the customer request under 2000 characters."),
  competitive_context: z
    .string()
    .trim()
    .max(1000, "Keep competitive context under 1000 characters.")
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type VisitorSubmitInput = z.infer<typeof VisitorSubmitSchema>;

// Strip protocol + path off a free-form domain entry. Returns null when
// the input doesn't look like a valid hostname after cleanup. Used on
// the server side before persisting to `customers.domain`.
export function normalizeDomain(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  // Strip leading protocol, www., and any path/querystring.
  const stripped = trimmed
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[\/?#]/)[0];
  if (!stripped) return null;
  if (!DOMAIN_RE.test(stripped)) return null;
  return stripped;
}
