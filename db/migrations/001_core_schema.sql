-- 001_core_schema.sql
-- Customers, deals, deal reviews, audit log. Mirrors docs/02-data-model.md.

CREATE TABLE IF NOT EXISTS customers (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  domain          TEXT NOT NULL,
  segment         TEXT NOT NULL,
  employee_count  INTEGER NOT NULL,
  industry        TEXT NOT NULL,
  hq_country      TEXT NOT NULL,
  funding_stage   TEXT,
  arr_estimate    REAL,
  health_score    INTEGER,
  is_real         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deals (
  id                    TEXT PRIMARY KEY,
  customer_id           TEXT NOT NULL REFERENCES customers(id),
  name                  TEXT NOT NULL,
  deal_type             TEXT NOT NULL,
  stage                 TEXT NOT NULL,
  acv                   REAL NOT NULL,
  tcv                   REAL NOT NULL,
  term_months           INTEGER NOT NULL,
  ramp_schedule_json    TEXT,
  list_price            REAL NOT NULL,
  proposed_price        REAL NOT NULL,
  discount_pct          REAL NOT NULL,
  discount_reason       TEXT,
  payment_terms         TEXT NOT NULL,
  payment_terms_notes   TEXT,
  pricing_model         TEXT NOT NULL,
  usage_commit_units    INTEGER,
  overage_rate          REAL,
  non_standard_clauses  TEXT,
  ae_owner              TEXT NOT NULL,
  ae_manager            TEXT NOT NULL,
  competitive_context   TEXT,
  customer_request      TEXT NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  close_date            TEXT,
  is_scenario           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_customer ON deals(customer_id);
CREATE INDEX IF NOT EXISTS idx_deals_is_scenario ON deals(is_scenario);

CREATE TABLE IF NOT EXISTS deal_reviews (
  id                       TEXT PRIMARY KEY,
  deal_id                  TEXT NOT NULL REFERENCES deals(id),
  ran_at                   TEXT NOT NULL DEFAULT (datetime('now')),
  ran_by                   TEXT NOT NULL DEFAULT 'orchestrator',
  pricing_output_json      TEXT NOT NULL,
  asc606_output_json       TEXT NOT NULL,
  redline_output_json      TEXT NOT NULL,
  approval_output_json     TEXT NOT NULL,
  comms_output_json        TEXT NOT NULL,
  similar_deals_json       TEXT NOT NULL,
  customer_signals_json    TEXT NOT NULL,
  synthesis_summary        TEXT NOT NULL,
  total_runtime_ms         INTEGER NOT NULL,
  total_tokens_used        INTEGER,
  is_visitor_submitted     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_reviews_deal ON deal_reviews(deal_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id              TEXT PRIMARY KEY,
  review_id       TEXT NOT NULL REFERENCES deal_reviews(id),
  step_index      INTEGER NOT NULL,
  agent_name      TEXT NOT NULL,
  step_label      TEXT NOT NULL,
  input_json      TEXT NOT NULL,
  output_json     TEXT NOT NULL,
  reasoning_text  TEXT NOT NULL,
  tools_called    TEXT,
  duration_ms     INTEGER NOT NULL,
  tokens_used     INTEGER,
  ran_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_review ON audit_log(review_id);
