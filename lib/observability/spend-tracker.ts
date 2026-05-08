import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Lightweight JSONL spend tracker. Per the Phase 7c brief, observability
// (not throttling): every visitor-triggered orchestrator run logs its
// per-agent + total spend, and a daily rollup file accumulates the
// totals. NO RATE LIMITING — visitor submissions are unbounded and the
// tracker never gates traffic.
//
// Two files live under `logs/`:
//   • spend-events.jsonl   — append-only event log (one line per run)
//   • spend-daily.json     — { "YYYY-MM-DD": { runs, total_usd, by_model } }
//
// The directory is gitignored. Both files are best-effort; failures are
// swallowed so an observability hiccup never breaks the user-visible
// flow. The daily rollup is rewritten in-place after each event to keep
// the API surface "read this single small file" trivial.

const LOG_DIR = join(process.cwd(), "logs");
const EVENT_PATH = join(LOG_DIR, "spend-events.jsonl");
const DAILY_PATH = join(LOG_DIR, "spend-daily.json");

export interface SpendEventInput {
  // ISO timestamp; defaults to now.
  ts?: string;
  // The triggering surface, e.g. "visitor-{sessionId}" or "scenario-{id}".
  source: string;
  deal_id: string;
  review_id: string | null;
  total_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  duration_ms: number;
  per_agent: Record<
    string,
    {
      duration_ms: number;
      input_tokens: number | null;
      output_tokens: number | null;
      cost_usd: number | null;
    }
  >;
}

export interface SpendDailyRollup {
  [date: string]: {
    runs: number;
    total_usd: number;
    total_input_tokens: number;
    total_output_tokens: number;
    by_agent: Record<string, { runs: number; total_usd: number }>;
  };
}

export function recordSpendEvent(input: SpendEventInput): void {
  try {
    ensureLogDir();
    const ts = input.ts ?? new Date().toISOString();
    const event = { ...input, ts };
    appendEvent(event);
    updateDaily(ts, event);
  } catch (err) {
    console.warn(
      "[spend-tracker] log write failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

function appendEvent(event: SpendEventInput & { ts: string }): void {
  // Plain JSONL — one line per event. Atomic-enough for a demo: appendFile
  // would race with an in-progress rotation, but we don't rotate.
  const line = JSON.stringify(event) + "\n";
  // appendFileSync via writeFileSync({flag:"a"}) — sticking to writeFileSync
  // keeps the imports minimal.
  if (!existsSync(EVENT_PATH)) {
    writeFileSync(EVENT_PATH, line);
    return;
  }
  // Read-modify-write at this scale is fine for a demo log; hot path
  // is one line per orchestrator run.
  const prior = readFileSync(EVENT_PATH, "utf-8");
  writeFileSync(EVENT_PATH, prior + line);
}

function updateDaily(
  ts: string,
  event: SpendEventInput & { ts: string },
): void {
  const date = ts.slice(0, 10); // YYYY-MM-DD
  let rollup: SpendDailyRollup = {};
  if (existsSync(DAILY_PATH)) {
    try {
      rollup = JSON.parse(readFileSync(DAILY_PATH, "utf-8")) as SpendDailyRollup;
    } catch {
      rollup = {};
    }
  }
  const day =
    rollup[date] ??
    {
      runs: 0,
      total_usd: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      by_agent: {},
    };
  day.runs += 1;
  day.total_usd += event.total_usd;
  day.total_input_tokens += event.total_input_tokens;
  day.total_output_tokens += event.total_output_tokens;

  for (const [agent, m] of Object.entries(event.per_agent)) {
    const slot = day.by_agent[agent] ?? { runs: 0, total_usd: 0 };
    slot.runs += 1;
    slot.total_usd += m.cost_usd ?? 0;
    day.by_agent[agent] = slot;
  }

  rollup[date] = day;
  writeFileSync(DAILY_PATH, JSON.stringify(rollup, null, 2));
}
