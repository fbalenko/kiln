-- 004_simulated_signals.sql
-- Adds a JSON-encoded `simulated_signals` column to customers.
-- Used by the Phase 5 customer-signals fetcher: fictional customers (is_real=0)
-- with simulated_signals serve those instead of calling Exa, so the demo
-- doesn't return unrelated public results for invented company names.
-- Real customers (is_real=1) ignore this column and always hit Exa live.

ALTER TABLE customers ADD COLUMN simulated_signals TEXT;
