-- 005_slack_posts.sql
-- Persist Slack post status on deal_reviews so the UI can link cache replays
-- back to the original message instead of re-posting (which would spam
-- #deal-desk every time someone clicks "Run review").

ALTER TABLE deal_reviews ADD COLUMN slack_channel       TEXT;
ALTER TABLE deal_reviews ADD COLUMN slack_thread_ts     TEXT;
ALTER TABLE deal_reviews ADD COLUMN slack_posted_at     TEXT;
ALTER TABLE deal_reviews ADD COLUMN slack_permalink     TEXT;
ALTER TABLE deal_reviews ADD COLUMN slack_post_status   TEXT;
ALTER TABLE deal_reviews ADD COLUMN slack_post_reason   TEXT;
ALTER TABLE deal_reviews ADD COLUMN slack_post_error    TEXT;
