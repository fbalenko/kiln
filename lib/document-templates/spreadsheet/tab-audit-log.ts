import type { Workbook } from "exceljs";
import type { ArtifactInput } from "../types";
import { getDb } from "@/lib/db/client";
import {
  addTitleRow,
  FMT_NUM,
  setColumnWidths,
  styleBody,
  styleHeader,
  styleMono,
} from "./styles";

// Tab 10 — Audit Log. Static dump of audit_log rows for this review,
// chronological. When the review wasn't persisted (cached scenario
// replay), the tab shows the per-agent timing pulled from the cache
// metadata so the visitor still sees the run-shape — better than a
// blank tab.

export function buildAuditLogTab(
  workbook: Workbook,
  input: ArtifactInput,
  tabName: string,
): void {
  const ws = workbook.addWorksheet(tabName);
  setColumnWidths(ws, [10, 24, 44, 14, 14, 28]);

  let row = addTitleRow(
    ws,
    "Audit Log",
    "Chronological agent decisions for this review.",
  );

  const headers = ["#", "Agent", "Step", "Duration (s)", "Tokens", "Run at"];
  for (let i = 0; i < headers.length; i++) {
    const c = ws.getCell(row, i + 1);
    c.value = headers[i];
    styleHeader(c);
  }
  row++;

  // Try DB first — live runs persist real audit rows. If the review was
  // a cache replay (no rows), fall back to the per-agent timing block on
  // the cached file, surfaced here as one row per agent.
  const dbRows = lookupAuditRows(input.reviewId);

  if (dbRows.length > 0) {
    for (const r of dbRows) {
      writeRow(ws, row, {
        index: r.step_index,
        agent: r.agent_name,
        step: r.step_label,
        durationSec: r.duration_ms / 1000,
        tokens: r.tokens_used ?? null,
        ranAt: r.ran_at,
      });
      row++;
    }
    return;
  }

  // Cache fallback. The per-agent timings live on the cached file metadata
  // in `OrchestratorCacheFile.metadata.per_agent`. We don't import the
  // cache shape here to avoid a circular import — the artifact route
  // already loaded it once. We just synthesize a shape by reading the
  // public agent metadata that's already on the input via the cache.
  // For now: a single placeholder row per agent name, derived from the
  // outputs we *do* have. This keeps the tab non-empty for cache replays.
  const placeholders: Array<{ agent: string; step: string }> = [
    { agent: "Orchestrator", step: "fetch_deal + Step 2 fan-out" },
    { agent: "Pricing Agent", step: "evaluate guardrails + alternatives" },
    { agent: "ASC 606 Agent", step: "performance obligations + recognition" },
    { agent: "Redline Agent", step: "flag clauses + draft counters" },
    { agent: "Approval Agent", step: "matrix evaluation + cycle estimate" },
    { agent: "Comms Agent", step: "Slack + AE + customer + one-pager" },
    { agent: "Orchestrator", step: "synthesis (Opus 4.7)" },
  ];

  for (let i = 0; i < placeholders.length; i++) {
    const p = placeholders[i];
    writeRow(ws, row, {
      index: i + 1,
      agent: p.agent,
      step: p.step,
      durationSec: null,
      tokens: null,
      ranAt: input.generatedAt.toISOString(),
    });
    row++;
  }

  row++;
  const note = ws.getCell(row, 1);
  note.value =
    "Note: cached scenario replay — per-agent durations and token counts are not persisted. Re-run live to populate this tab from audit_log.";
  note.font = { name: "Calibri", italic: true, size: 10, color: { argb: "FF737373" } };
  ws.mergeCells(row, 1, row, 6);
  ws.getRow(row).alignment = { wrapText: true, vertical: "top" };
  ws.getRow(row).height = 32;
}

function writeRow(
  ws: ReturnType<Workbook["addWorksheet"]>,
  row: number,
  data: {
    index: number;
    agent: string;
    step: string;
    durationSec: number | null;
    tokens: number | null;
    ranAt: string;
  },
): void {
  const idx = ws.getCell(row, 1);
  idx.value = data.index;
  idx.numFmt = FMT_NUM;
  styleMono(idx);

  const agent = ws.getCell(row, 2);
  agent.value = data.agent;
  styleBody(agent);

  const step = ws.getCell(row, 3);
  step.value = data.step;
  styleBody(step);
  step.alignment = { vertical: "middle", wrapText: true };

  const dur = ws.getCell(row, 4);
  dur.value = data.durationSec;
  dur.numFmt = "0.0";
  styleMono(dur);

  const tok = ws.getCell(row, 5);
  tok.value = data.tokens;
  tok.numFmt = FMT_NUM;
  styleMono(tok);

  const ran = ws.getCell(row, 6);
  ran.value = data.ranAt;
  styleMono(ran);
}

interface AuditRow {
  step_index: number;
  agent_name: string;
  step_label: string;
  duration_ms: number;
  tokens_used: number | null;
  ran_at: string;
}

function lookupAuditRows(reviewId: string): AuditRow[] {
  // Cache replay reviewIds are deal_ids, not rev_*. Skip the query
  // entirely so we don't hit the DB on every tab build with garbage.
  if (!reviewId.startsWith("rev_")) return [];
  const db = getDb();
  return db
    .prepare(
      `SELECT step_index, agent_name, step_label, duration_ms,
              tokens_used, ran_at
         FROM audit_log
        WHERE review_id = ?
        ORDER BY step_index ASC, ran_at ASC`,
    )
    .all(reviewId) as AuditRow[];
}
