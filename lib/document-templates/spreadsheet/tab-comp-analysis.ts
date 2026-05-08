import type { Workbook } from "exceljs";
import type { ArtifactInput } from "../types";
import { listDeals } from "@/lib/db/queries";
import {
  addTitleRow,
  COLOR,
  FMT_MONEY_WHOLE,
  FMT_NUM,
  FMT_PCT,
  setColumnWidths,
  styleBody,
  styleHeader,
  styleLabel,
} from "./styles";

// Tab 9 — Comp Analysis. Pivot-table-style aggregations across the
// pipeline. Data analysis fluency signal — the HM scans the avg-discount-
// by-segment block + win-rate-by-AE block and reads the artifact as
// "this person can do real ops analysis," not "this person can write
// hard-coded numbers."
//
// Each block is a real aggregation against listDeals() done at
// generation time. The numbers in the cells are static (no live
// formulas) — the data is fixed at generation, the analysis is real.

export function buildCompAnalysisTab(
  workbook: Workbook,
  _input: ArtifactInput,
  tabName: string,
): void {
  const ws = workbook.addWorksheet(tabName);
  setColumnWidths(ws, [28, 16, 16, 16, 28]);

  let cursor = addTitleRow(
    ws,
    "Comp Analysis",
    "Pipeline-wide aggregations: discount by segment, ACV by deal type, win rate by AE.",
  );

  const deals = listDeals();

  // ---- Block 1: Avg discount % + avg margin proxy by customer segment
  const segHeader = ws.getCell(cursor, 1);
  segHeader.value = "AVERAGE DISCOUNT % BY CUSTOMER SEGMENT";
  segHeader.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF737373" } };
  cursor++;

  const segHeaders = ["Segment", "Avg discount", "Avg ACV", "# deals"];
  for (let i = 0; i < segHeaders.length; i++) {
    const c = ws.getCell(cursor, i + 1);
    c.value = segHeaders[i];
    styleHeader(c);
  }
  cursor++;

  const segments: Array<["enterprise" | "mid_market" | "plg_self_serve", string]> = [
    ["enterprise", "Enterprise"],
    ["mid_market", "Mid-market"],
    ["plg_self_serve", "PLG / Self-serve"],
  ];
  for (const [key, label] of segments) {
    const subset = deals.filter((d) => d.customer.segment === key);
    const lbl = ws.getCell(cursor, 1);
    lbl.value = label;
    styleLabel(lbl);
    const disc = ws.getCell(cursor, 2);
    disc.value = subset.length === 0 ? 0 : avg(subset.map((d) => d.discount_pct)) / 100;
    disc.numFmt = FMT_PCT;
    styleBody(disc);
    const acv = ws.getCell(cursor, 3);
    acv.value = subset.length === 0 ? 0 : avg(subset.map((d) => d.acv));
    acv.numFmt = FMT_MONEY_WHOLE;
    styleBody(acv);
    const cnt = ws.getCell(cursor, 4);
    cnt.value = subset.length;
    cnt.numFmt = FMT_NUM;
    styleBody(cnt);
    cursor++;
  }

  // ---- Block 2: Avg ACV by deal type ---------------------------------
  cursor += 2;
  const dtHeader = ws.getCell(cursor, 1);
  dtHeader.value = "AVERAGE ACV BY DEAL TYPE";
  dtHeader.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF737373" } };
  cursor++;

  const dtHeaders = ["Deal type", "Avg ACV", "Median ACV", "# deals"];
  for (let i = 0; i < dtHeaders.length; i++) {
    const c = ws.getCell(cursor, i + 1);
    c.value = dtHeaders[i];
    styleHeader(c);
  }
  cursor++;

  const dealTypes: Array<[
    "new_logo" | "expansion" | "renewal" | "partnership",
    string,
  ]> = [
    ["new_logo", "New logo"],
    ["expansion", "Expansion"],
    ["renewal", "Renewal"],
    ["partnership", "Partnership"],
  ];
  for (const [key, label] of dealTypes) {
    const subset = deals.filter((d) => d.deal_type === key);
    const lbl = ws.getCell(cursor, 1);
    lbl.value = label;
    styleLabel(lbl);
    const a = ws.getCell(cursor, 2);
    a.value = subset.length === 0 ? 0 : avg(subset.map((d) => d.acv));
    a.numFmt = FMT_MONEY_WHOLE;
    styleBody(a);
    const m = ws.getCell(cursor, 3);
    m.value = subset.length === 0 ? 0 : median(subset.map((d) => d.acv));
    m.numFmt = FMT_MONEY_WHOLE;
    styleBody(m);
    const cnt = ws.getCell(cursor, 4);
    cnt.value = subset.length;
    cnt.numFmt = FMT_NUM;
    styleBody(cnt);
    cursor++;
  }

  // ---- Block 3: Win rate by AE ---------------------------------------
  cursor += 2;
  const aeHeader = ws.getCell(cursor, 1);
  aeHeader.value = "WIN RATE BY AE OWNER";
  aeHeader.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF737373" } };
  cursor++;

  const aeHeaders = ["AE", "Won", "Lost", "Win rate", "Avg ACV (won)"];
  for (let i = 0; i < aeHeaders.length; i++) {
    const c = ws.getCell(cursor, i + 1);
    c.value = aeHeaders[i];
    styleHeader(c);
  }
  cursor++;

  const aeBuckets = new Map<string, { won: number; lost: number; wonAcvSum: number }>();
  for (const d of deals) {
    if (d.stage !== "closed_won" && d.stage !== "closed_lost") continue;
    const b = aeBuckets.get(d.ae_owner) ?? { won: 0, lost: 0, wonAcvSum: 0 };
    if (d.stage === "closed_won") {
      b.won++;
      b.wonAcvSum += d.acv;
    } else {
      b.lost++;
    }
    aeBuckets.set(d.ae_owner, b);
  }
  const aeRows = Array.from(aeBuckets.entries())
    .sort((a, b) => b[1].won + b[1].lost - (a[1].won + a[1].lost))
    .slice(0, 8);

  for (const [ae, b] of aeRows) {
    const lbl = ws.getCell(cursor, 1);
    lbl.value = ae;
    styleLabel(lbl);
    const won = ws.getCell(cursor, 2);
    won.value = b.won;
    won.numFmt = FMT_NUM;
    styleBody(won);
    const lost = ws.getCell(cursor, 3);
    lost.value = b.lost;
    lost.numFmt = FMT_NUM;
    styleBody(lost);
    const rate = ws.getCell(cursor, 4);
    const total = b.won + b.lost;
    rate.value = total === 0 ? 0 : b.won / total;
    rate.numFmt = FMT_PCT;
    styleBody(rate);
    if (rate.value !== 0 && (rate.value as number) >= 0.5) {
      rate.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLOR.goodGreenText } };
    } else if (rate.value !== 0) {
      rate.font = { name: "Calibri", size: 11, color: { argb: COLOR.warnAmberText } };
    }
    const avgWon = ws.getCell(cursor, 5);
    avgWon.value = b.won === 0 ? 0 : b.wonAcvSum / b.won;
    avgWon.numFmt = FMT_MONEY_WHOLE;
    styleBody(avgWon);
    cursor++;
  }

  // ---- Note --------------------------------------------------------
  cursor += 2;
  const note = ws.getCell(cursor, 1);
  note.value =
    "Note: aggregations computed at generation time across all deals visible to listDeals(). Chart visualizations deferred — the table data above is operator-grade.";
  note.font = { name: "Calibri", italic: true, size: 10, color: { argb: "FF737373" } };
  ws.mergeCells(cursor, 1, cursor, 5);
  ws.getRow(cursor).alignment = { wrapText: true };
  ws.getRow(cursor).height = 30;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
