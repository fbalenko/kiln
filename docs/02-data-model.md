# 02 — Data Model

## Design principles

- **Realistic over comprehensive.** A small set of fields that feel real beats a sprawling schema that feels generic. Every field should appear in at least one scenario.
- **Mirror Salesforce semantics where it makes sense.** Use field names a deal desk operator would recognize: `account`, `opportunity`, `stage`, `acv`, `arr`, `close_date`, `discount_pct`, `discount_reason`. The HM scanning the schema should think *"yeah, that's how I'd model it."*
- **Snapshot-based versioning.** Every deal review run creates an immutable snapshot in the audit log. We never mutate a past review; we append a new one.

## Tables

### `customers`

The companies in the mock pipeline. Mix of real public companies (Notion, Anthropic, Ramp) and fictional names with realistic profiles.

```sql
CREATE TABLE customers (
  id              TEXT PRIMARY KEY,           -- 'cust_anthropic'
  name            TEXT NOT NULL,              -- 'Anthropic'
  domain          TEXT NOT NULL,              -- 'anthropic.com'
  segment         TEXT NOT NULL,              -- 'enterprise' | 'mid_market' | 'plg_self_serve'
  employee_count  INTEGER NOT NULL,
  industry        TEXT NOT NULL,              -- 'AI/ML', 'SaaS', 'Fintech', etc.
  hq_country      TEXT NOT NULL,              -- ISO 3166-1 alpha-2
  funding_stage   TEXT,                       -- 'Seed', 'Series A', ..., 'Public'
  arr_estimate    REAL,                       -- estimated customer ARR (public/inferred)
  health_score    INTEGER,                    -- 0-100, see /docs/07-extra-features
  is_real         BOOLEAN NOT NULL DEFAULT 0, -- if true, names a real company
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `deals`

Each row is an opportunity in the mock pipeline.

```sql
CREATE TABLE deals (
  id                    TEXT PRIMARY KEY,    -- 'deal_anthropic_2026q1_expansion'
  customer_id           TEXT NOT NULL REFERENCES customers(id),
  name                  TEXT NOT NULL,       -- '2026 Q1 Multi-Year Expansion'
  deal_type             TEXT NOT NULL,       -- 'new_logo' | 'expansion' | 'renewal' | 'partnership'
  stage                 TEXT NOT NULL,       -- 'discovery' | 'proposal' | 'negotiation' | 'review' | 'closed_won' | 'closed_lost'
  acv                   REAL NOT NULL,
  tcv                   REAL NOT NULL,
  term_months           INTEGER NOT NULL,
  ramp_schedule_json    TEXT,                -- JSON array of {month, amount}
  list_price            REAL NOT NULL,
  proposed_price        REAL NOT NULL,
  discount_pct          REAL NOT NULL,
  discount_reason       TEXT,
  payment_terms         TEXT NOT NULL,       -- 'net_30' | 'net_60' | 'annual_upfront' | 'quarterly' | 'custom'
  payment_terms_notes   TEXT,
  pricing_model         TEXT NOT NULL,       -- 'subscription' | 'usage_based' | 'hybrid' | 'one_time'
  usage_commit_units    INTEGER,             -- e.g., 1M API calls/year
  overage_rate          REAL,
  non_standard_clauses  TEXT,                -- JSON array of strings: ['MFN', 'rollover_credits', 'exclusivity']
  ae_owner              TEXT NOT NULL,
  ae_manager            TEXT NOT NULL,
  competitive_context   TEXT,                -- free-text
  customer_request      TEXT NOT NULL,       -- the actual ask
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  close_date            TEXT,
  is_scenario           BOOLEAN NOT NULL DEFAULT 0  -- if true, this is one of the 5 hero scenarios
);
```

### `deal_reviews`

The output of a single agent pipeline run. One review per (deal, run_id) pair. Keeps full reasoning trace.

```sql
CREATE TABLE deal_reviews (
  id                       TEXT PRIMARY KEY,        -- 'review_<deal_id>_<timestamp>'
  deal_id                  TEXT NOT NULL REFERENCES deals(id),
  ran_at                   TEXT NOT NULL DEFAULT (datetime('now')),
  ran_by                   TEXT NOT NULL DEFAULT 'orchestrator', -- which agent flow
  pricing_output_json      TEXT NOT NULL,
  asc606_output_json       TEXT NOT NULL,
  redline_output_json      TEXT NOT NULL,
  approval_output_json     TEXT NOT NULL,
  comms_output_json        TEXT NOT NULL,
  similar_deals_json       TEXT NOT NULL,           -- top-3 similar deals via vector
  customer_signals_json    TEXT NOT NULL,           -- Exa results
  synthesis_summary        TEXT NOT NULL,           -- the orchestrator's final summary
  total_runtime_ms         INTEGER NOT NULL,
  total_tokens_used        INTEGER,
  is_visitor_submitted     BOOLEAN NOT NULL DEFAULT 0
);
```

### `audit_log`

Every individual agent decision logged with full reasoning trace. Enables the audit log UI feature.

```sql
CREATE TABLE audit_log (
  id              TEXT PRIMARY KEY,
  review_id       TEXT NOT NULL REFERENCES deal_reviews(id),
  step_index      INTEGER NOT NULL,        -- order of execution
  agent_name      TEXT NOT NULL,           -- 'pricing', 'asc606', etc.
  step_label      TEXT NOT NULL,           -- human-readable
  input_json      TEXT NOT NULL,           -- what the agent received
  output_json     TEXT NOT NULL,           -- what the agent produced
  reasoning_text  TEXT NOT NULL,           -- the agent's explanation
  tools_called    TEXT,                    -- JSON array of tool names
  duration_ms     INTEGER NOT NULL,
  tokens_used     INTEGER,
  ran_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `approval_matrix`

The configurable approval matrix. Each row is a rule. Visitors can edit this in the UI (in-memory clone) and re-run a deal against their custom matrix.

```sql
CREATE TABLE approval_matrix (
  id                       TEXT PRIMARY KEY,
  rule_name                TEXT NOT NULL,
  condition_json           TEXT NOT NULL,     -- JSON: {"discount_pct": {">": 25}, "acv": {">": 500000}}
  required_approver_role   TEXT NOT NULL,     -- 'ae_manager' | 'rev_ops' | 'finance' | 'cfo' | 'legal' | 'ceo'
  rule_priority            INTEGER NOT NULL,  -- lower = checked first
  is_default               BOOLEAN NOT NULL DEFAULT 1,
  notes                    TEXT
);
```

### `pricing_guardrails`

Margin, discount, and ramp guardrails. Used by the pricing agent.

```sql
CREATE TABLE pricing_guardrails (
  id                  TEXT PRIMARY KEY,
  rule_name           TEXT NOT NULL,
  applies_to_segment  TEXT,                    -- 'enterprise' | 'mid_market' | 'plg_self_serve' | NULL = all
  metric              TEXT NOT NULL,           -- 'discount_pct' | 'margin_pct' | 'ramp_length_months'
  operator            TEXT NOT NULL,           -- '<=', '>=', '=='
  threshold_value     REAL NOT NULL,
  severity            TEXT NOT NULL,           -- 'warn' | 'block_without_approval' | 'block_absolute'
  notes               TEXT
);
```

### `deal_embeddings`

Vector embeddings for semantic similarity search over past deals. Uses `sqlite-vec`.

```sql
-- Created via sqlite-vec virtual table
CREATE VIRTUAL TABLE deal_embeddings USING vec0(
  deal_id TEXT PRIMARY KEY,
  embedding FLOAT[1536]   -- text-embedding-3-small dimensions
);
```

The text we embed for each deal:
```
Customer: {name} ({segment}, {industry}, {employee_count} employees)
Deal type: {deal_type}
ACV: ${acv}, term: {term_months}mo, pricing: {pricing_model}
Discount: {discount_pct}% — {discount_reason}
Non-standard clauses: {non_standard_clauses}
Customer request: {customer_request}
Competitive context: {competitive_context}
```

### `scenario_metadata`

Marks the 5 hero scenarios with display ordering and "Start here" highlighting.

```sql
CREATE TABLE scenario_metadata (
  deal_id            TEXT PRIMARY KEY REFERENCES deals(id),
  display_order      INTEGER NOT NULL,
  is_recommended     BOOLEAN NOT NULL DEFAULT 0,
  hero_tagline       TEXT NOT NULL,        -- e.g., 'Strategic enterprise expansion with MFN clause'
  difficulty_label   TEXT NOT NULL,        -- 'medium' | 'high' | 'expert'
  estimated_review_time_seconds INTEGER NOT NULL DEFAULT 60
);
```

## Mock data spec

### Customer count
- **6 real public companies** with verifiable employee counts and funding (Notion, Anthropic, Ramp, Verkada, Intercom, Gong) — these match Clay's known customer base
- **24–34 fictional customers** with realistic but invented names, distributed across:
  - 8 enterprise (5,000+ employees)
  - 12 mid-market (200–5,000 employees)
  - 14 PLG/self-serve (under 200 employees)

### Deal distribution
| Stage | Count | Notes |
|---|---|---|
| `discovery` | 4 | early funnel, low detail |
| `proposal` | 8 | initial structures proposed |
| `negotiation` | 10 | pricing back-and-forth, this is where most reviews happen |
| `review` | 5 | the **5 hero scenarios** — at deal-desk review |
| `closed_won` | 8 | populates the "similar past deals" feature |
| `closed_lost` | 5 | educational — shows the agent some failures |

Total: 40 deals.

### Required realism details

For each deal in `negotiation` and `review` stages:
- The `customer_request` field must read like a real AE wrote it. Specific dollar amounts. Specific clause language. Specific competitive references.
- The `discount_reason` must be plausible (e.g., "competitive displacement of Apollo + Outreach stack", "multi-year commit in exchange for ACV reduction", "Q4 budget timing").
- `non_standard_clauses` must include realistic mixes: MFN, rollover credits, exclusivity windows, custom data residency, expansion-pricing locks, professional services bundling.
- `ae_owner` and `ae_manager` should be a small set of recurring fake names (4 AEs, 2 managers) to feel like a real org.

### The 5 hero scenarios

These are detailed in `docs/04-scenarios.md`. They populate the `is_scenario = 1` rows. Each one is engineered to make a different sub-agent shine:

| # | Scenario | Highlights agent |
|---|---|---|
| 1 | Anthropic-shaped strategic enterprise expansion with MFN | Redline + Approval |
| 2 | Notion-shaped self-serve to enterprise with rollover credits | ASC 606 |
| 3 | Competitive displacement with aggressive discount stack | Pricing |
| 4 | Renewal-at-risk with commit reduction | Pricing + Comms |
| 5 | Agency partnership with white-label and rev share | Approval (escalation path) |

## Embeddings strategy

- Embed all 40 deals on seed using `text-embedding-3-small`.
- Re-embed any deal whose `customer_request` or `non_standard_clauses` change (in practice, only on `submit-your-own-deal` scenarios — those create transient embeddings in memory, never persisted).
- For visitor-submitted deals, compute embedding at submit time, run k-NN against the seeded set, return top-3.

## Why this schema

Every field on `deals` is one a deal desk hire would expect to see. Every field on `audit_log` exists to make reasoning legible. Every field on `approval_matrix` and `pricing_guardrails` exists to be edited live in the UI.

The schema is deliberately small. We don't have `contacts`, `activities`, `email_logs`, `meetings`, `quotes`, `attachments`, or any of the other Salesforce nouns. They don't advance the demo arc.
