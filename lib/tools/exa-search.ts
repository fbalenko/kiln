import Exa from "exa-js";

// Customer-signals fetcher per docs/06-integrations.md §Exa.
//
//   • Three focused queries per customer: funding, exec change, product launch
//   • Recency window: 6 months
//   • In-process LRU cache keyed by domain + query, 24h TTL
//   • Failure mode: return empty array, never throw
//
// Output shape is normalized for the UI: headline, source domain, published
// date, one-line summary, plus a relevance score the orchestrator's reasoning
// or simple recency heuristic supplies later.

export type SignalKind = "funding" | "leadership" | "product" | "other";

export interface CustomerSignal {
  kind: SignalKind;
  headline: string;
  source_domain: string;
  url: string;
  published_date: string | null;
  summary: string;
  score: number; // 0..100, higher = more relevant
}

export interface CustomerSignalsResult {
  source: "exa" | "exa_unavailable";
  customer: { name: string; domain: string };
  fetched_at: string;
  signals: CustomerSignal[];
  note: string | null;
}

interface CacheEntry {
  fetchedAt: number;
  result: CustomerSignalsResult;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RECENCY_MONTHS = 6;
const PER_QUERY_RESULTS = 3;
const MAX_SIGNALS_RETURNED = 5;

const globalForCache = globalThis as unknown as {
  __exaSignalsCache?: Map<string, CacheEntry>;
};
function getCache(): Map<string, CacheEntry> {
  if (!globalForCache.__exaSignalsCache) {
    globalForCache.__exaSignalsCache = new Map();
  }
  return globalForCache.__exaSignalsCache;
}

let cachedClient: Exa | null = null;
function getExaClient(): Exa | null {
  if (!process.env.EXA_API_KEY) return null;
  if (cachedClient) return cachedClient;
  cachedClient = new Exa(process.env.EXA_API_KEY);
  return cachedClient;
}

export interface FetchCustomerSignalsArgs {
  customer: { name: string; domain: string };
  // Allow callers to override the topic queries — visitor-submitted deals
  // can pick narrower queries. Defaults match the docs spec.
  topics?: ReadonlyArray<{ kind: SignalKind; query: string }>;
}

export async function fetchCustomerSignals(
  args: FetchCustomerSignalsArgs,
): Promise<CustomerSignalsResult> {
  const { customer } = args;
  const cacheKey = customer.domain.toLowerCase();
  const cache = getCache();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.result;
  }

  const client = getExaClient();
  if (!client) {
    const result: CustomerSignalsResult = {
      source: "exa_unavailable",
      customer,
      fetched_at: new Date().toISOString(),
      signals: [],
      note: "Exa API key not configured. Skipping customer signals.",
    };
    return result;
  }

  const topics =
    args.topics ??
    ([
      { kind: "funding", query: `${customer.name} funding round announcement` },
      {
        kind: "leadership",
        query: `${customer.name} executive leadership change`,
      },
      { kind: "product", query: `${customer.name} product launch announcement` },
    ] as const);

  const startPublishedDate = monthsAgoIso(RECENCY_MONTHS);

  let allSignals: CustomerSignal[] = [];
  let anyFailed = false;
  await Promise.all(
    topics.map(async ({ kind, query }) => {
      try {
        const resp = await client.searchAndContents(query, {
          numResults: PER_QUERY_RESULTS,
          startPublishedDate,
          useAutoprompt: true,
          type: "auto",
          summary: true,
        });
        for (const r of resp.results ?? []) {
          if (!r.url) continue;
          const domain = safeDomain(r.url);
          if (!domain) continue;
          const summary = pickSummary(r);
          allSignals.push({
            kind,
            headline: truncate(r.title ?? domain, 90),
            source_domain: domain,
            url: r.url,
            published_date: r.publishedDate ?? null,
            summary: truncate(summary, 240),
            score: clampScore(r.score),
          });
        }
      } catch (err) {
        anyFailed = true;
        console.warn(
          `[exa] query failed for "${query}":`,
          err instanceof Error ? err.message : err,
        );
      }
    }),
  );

  // Dedupe by URL — Exa occasionally returns the same article from two queries.
  // Keep the higher-scoring instance.
  const dedup = new Map<string, CustomerSignal>();
  for (const s of allSignals) {
    const key = s.url.toLowerCase();
    const prior = dedup.get(key);
    if (!prior || prior.score < s.score) dedup.set(key, s);
  }
  allSignals = Array.from(dedup.values());

  // Sort by score desc, with a recency tiebreaker.
  allSignals.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.published_date ?? "").localeCompare(a.published_date ?? "");
  });

  const trimmed = allSignals.slice(0, MAX_SIGNALS_RETURNED);

  const result: CustomerSignalsResult = {
    source: "exa",
    customer,
    fetched_at: new Date().toISOString(),
    signals: trimmed,
    note:
      trimmed.length === 0
        ? anyFailed
          ? "Exa returned no usable results for this customer."
          : "No recent public signals found."
        : null,
  };

  cache.set(cacheKey, { fetchedAt: Date.now(), result });
  return result;
}

function pickSummary(r: { summary?: string; text?: string; title?: string | null }): string {
  if (typeof r.summary === "string" && r.summary.trim().length > 0) {
    return r.summary.trim();
  }
  if (typeof r.text === "string" && r.text.trim().length > 0) {
    return r.text.trim().split(/\s+/).slice(0, 60).join(" ");
  }
  return r.title ?? "";
}

function safeDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

function clampScore(s: number | undefined): number {
  if (typeof s !== "number" || Number.isNaN(s)) return 50;
  // Exa scores tend to land 0..1 (cosine-ish). Map to 0..100 for the UI.
  if (s <= 1) return Math.max(0, Math.min(100, Math.round(s * 100)));
  return Math.max(0, Math.min(100, Math.round(s)));
}

function monthsAgoIso(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}
