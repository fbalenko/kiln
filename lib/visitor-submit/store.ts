import type { OrchestratorCacheFile } from "@/lib/agents/orchestrator";
import type { DealWithCustomer } from "@/lib/db/queries";

// In-memory visitor session store. Process-local; rebuilt on cold start.
//
// What's tracked here:
//   • sessionId → dealId mapping (so /deals/visitor-{sessionId} can
//     resolve the persisted deal row).
//   • dealId → OrchestratorCacheFile (so a refresh of an active session
//     replays the prior run instead of re-firing the LLM pipeline).
//
// Everything else (customer row, deal row, deal_review row, embedding)
// lives in SQLite — those survive restarts. The in-memory cache is a
// pure latency optimisation: if the process restarts, the deal page
// hydrates straight from the most recent `deal_reviews` row instead.
//
// Cleanup runs every CLEANUP_INTERVAL_MS and drops sessions older than
// SESSION_TTL_MS. The SQLite-side cleanup of customer/deal/embedding
// rows fires from the same sweep so visitor data doesn't leak forever.
// Per the brief: NO RATE LIMITING. The sweeper is observability +
// cleanup only — it never gates traffic.

const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 min
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // matches the cookie TTL

interface VisitorSession {
  sessionId: string;
  dealId: string;
  customerId: string;
  createdAt: number;
}

// Vercel runtime: the SQLite file is read-only, so the visitor's full
// deal/customer/embedding has nowhere to live but in-process memory.
// This record carries everything getDealById + findSimilarDeals need.
export interface VisitorDealRecord {
  deal: DealWithCustomer;
  embedding: Buffer | null;
  createdAt: number;
}

const globalForStore = globalThis as unknown as {
  __kilnVisitorSessions?: Map<string, VisitorSession>;
  __kilnVisitorReviewCache?: Map<string, OrchestratorCacheFile>;
  __kilnVisitorDealRecords?: Map<string, VisitorDealRecord>;
  __kilnVisitorSweepStarted?: boolean;
  __kilnVisitorSweepCb?: ((dealId: string, customerId: string) => void) | null;
};

function sessions(): Map<string, VisitorSession> {
  if (!globalForStore.__kilnVisitorSessions) {
    globalForStore.__kilnVisitorSessions = new Map();
  }
  return globalForStore.__kilnVisitorSessions;
}

function reviewCache(): Map<string, OrchestratorCacheFile> {
  if (!globalForStore.__kilnVisitorReviewCache) {
    globalForStore.__kilnVisitorReviewCache = new Map();
  }
  return globalForStore.__kilnVisitorReviewCache;
}

function dealRecords(): Map<string, VisitorDealRecord> {
  if (!globalForStore.__kilnVisitorDealRecords) {
    globalForStore.__kilnVisitorDealRecords = new Map();
  }
  return globalForStore.__kilnVisitorDealRecords;
}

export function setVisitorDealRecord(
  dealId: string,
  record: { deal: DealWithCustomer; embedding: Buffer | null },
): void {
  dealRecords().set(dealId, {
    deal: record.deal,
    embedding: record.embedding,
    createdAt: Date.now(),
  });
}

export function getVisitorDealRecord(dealId: string): VisitorDealRecord | null {
  return dealRecords().get(dealId) ?? null;
}

export function clearVisitorDealRecord(dealId: string): void {
  dealRecords().delete(dealId);
}

export function setVisitorSession(s: {
  sessionId: string;
  dealId: string;
  customerId: string;
}): void {
  sessions().set(s.sessionId, {
    sessionId: s.sessionId,
    dealId: s.dealId,
    customerId: s.customerId,
    createdAt: Date.now(),
  });
}

export function getVisitorSession(sessionId: string): VisitorSession | null {
  return sessions().get(sessionId) ?? null;
}

export function getVisitorSessionByDealId(
  dealId: string,
): VisitorSession | null {
  for (const s of sessions().values()) {
    if (s.dealId === dealId) return s;
  }
  return null;
}

export function setVisitorReviewCache(
  dealId: string,
  cache: OrchestratorCacheFile,
): void {
  reviewCache().set(dealId, cache);
}

export function getVisitorReviewCache(
  dealId: string,
): OrchestratorCacheFile | null {
  return reviewCache().get(dealId) ?? null;
}

export function clearVisitorReviewCache(dealId: string): void {
  reviewCache().delete(dealId);
}

// Caller registers a hook the sweeper calls to drop SQLite rows for an
// expired session. Lives in the API route module (so this file stays
// free of better-sqlite3 imports — keeps the module dependency tree
// thin enough to import from client-bundle-adjacent code).
export function setExpiryHook(
  fn: ((dealId: string, customerId: string) => void) | null,
): void {
  globalForStore.__kilnVisitorSweepCb = fn;
}

function sweep(): void {
  const now = Date.now();
  const expired: VisitorSession[] = [];
  for (const [k, v] of sessions()) {
    if (now - v.createdAt > SESSION_TTL_MS) {
      expired.push(v);
      sessions().delete(k);
      reviewCache().delete(v.dealId);
      dealRecords().delete(v.dealId);
    }
  }
  const cb = globalForStore.__kilnVisitorSweepCb;
  if (cb && expired.length > 0) {
    for (const v of expired) {
      try {
        cb(v.dealId, v.customerId);
      } catch (err) {
        console.warn("[visitor-store] expiry hook failed:", err);
      }
    }
  }
}

// Module-load idempotent: only schedule one interval per process even if
// HMR re-evaluates this file.
if (
  typeof setInterval === "function" &&
  !globalForStore.__kilnVisitorSweepStarted
) {
  globalForStore.__kilnVisitorSweepStarted = true;
  const handle = setInterval(sweep, CLEANUP_INTERVAL_MS);
  // Don't keep the Node process alive just for this timer.
  if (typeof handle === "object" && handle !== null && "unref" in handle) {
    (handle as { unref: () => void }).unref();
  }
}

// Exposed for direct invocation by tests / API routes that want to
// force a sweep ahead of the next interval.
export { sweep as sweepVisitorSessions };
