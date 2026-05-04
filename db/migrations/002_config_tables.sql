-- 002_config_tables.sql
-- Approval matrix, pricing guardrails, scenario metadata.

CREATE TABLE IF NOT EXISTS approval_matrix (
  id                       TEXT PRIMARY KEY,
  rule_name                TEXT NOT NULL,
  condition_json           TEXT NOT NULL,
  required_approver_role   TEXT NOT NULL,
  rule_priority            INTEGER NOT NULL,
  is_default               INTEGER NOT NULL DEFAULT 1,
  notes                    TEXT
);

CREATE TABLE IF NOT EXISTS pricing_guardrails (
  id                  TEXT PRIMARY KEY,
  rule_name           TEXT NOT NULL,
  applies_to_segment  TEXT,
  metric              TEXT NOT NULL,
  operator            TEXT NOT NULL,
  threshold_value     REAL NOT NULL,
  severity            TEXT NOT NULL,
  notes               TEXT
);

CREATE TABLE IF NOT EXISTS scenario_metadata (
  deal_id                       TEXT PRIMARY KEY REFERENCES deals(id),
  display_order                 INTEGER NOT NULL,
  is_recommended                INTEGER NOT NULL DEFAULT 0,
  hero_tagline                  TEXT NOT NULL,
  difficulty_label              TEXT NOT NULL,
  estimated_review_time_seconds INTEGER NOT NULL DEFAULT 60
);
