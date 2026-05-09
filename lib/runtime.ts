// Vercel sets VERCEL=1 in build + runtime environments. Their function
// filesystem is read-only at runtime, so any code path that mutates the
// SQLite file (PRAGMA journal_mode = WAL, INSERT into deals/customers/
// deal_reviews/audit_log/deal_embeddings, migration application) has to
// branch on this flag and route through the in-memory equivalents.
//
// Locally we want the original read-write SQLite flow so the existing
// cleanup scripts, seed runner, and cache-regeneration utilities all
// keep working unchanged.

export const IS_VERCEL = process.env.VERCEL === "1";
