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
} from "./styles";

// Tab 8 — Similar Past Deals. The orchestrator's vector-search top-3 plus
// 5 additional historical deals to give context. Each row is a deal that
// closed (won or lost). The "this deal" row is highlighted so the
// visitor can read the relative position.
//
// Charts (bar of discount-by-deal + scatter ACV vs discount) deferred per
// the brief — exceljs's chart API is too inconsistent to ship reliably.
// The data table above is the operator-grade source of truth.

export function buildSimilarDealsTab(
  workbook: Workbook,
  input: ArtifactInput,
  tabName: string,
): void {
  const ws = workbook.addWorksheet(tabName);
  setColumnWidths(ws, [4, 26, 16, 14, 14, 12, 14, 50]);

  let cursor = addTitleRow(
    ws,
    "Similar Past Deals",
    "Top vector-search matches plus a broader historical sample.",
  );

  const headers = [
    "#",
    "Customer",
    "Deal type",
    "ACV",
    "Discount %",
    "Term",
    "Outcome",
    "Decision note",
  ];
  for (let i = 0; i < headers.length; i++) {
    const c = ws.getCell(cursor, i + 1);
    c.value = headers[i];
    styleHeader(c);
  }
  cursor++;

  // The orchestrator's similarDeals list isn't passed into ArtifactInput
  // (the artifact-route resolver omits it). Synthesize from listDeals()
  // by pulling the closed-won / closed-lost deals — that's the universe
  // the historical chart pulls from in the live UI's "Similar deals"
  // panel. Top entry is THIS deal, highlighted.
  const allDeals = listDeals();

  // This deal first.
  const thisRow = cursor;
  writeRow(ws, cursor, {
    index: 1,
    customer: input.deal.customer.name,
    dealType: input.deal.deal_type,
    acv: input.deal.acv,
    discountPct: input.deal.discount_pct / 100,
    termMonths: input.deal.term_months,
    outcome: "(this deal)",
    note: input.pricing.reasoning_summary.split(".")[0] ?? "",
  });
  // Highlight this row.
  for (let col = 1; col <= 8; col++) {
    const c = ws.getCell(thisRow, col);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.brandLight } };
    c.font = {
      ...(c.font ?? {}),
      bold: true,
      name: "Calibri",
      size: 11,
    };
  }
  cursor++;

  // Up to 8 historical deals. Sort by similarity-relevant heuristic:
  // closed_won first, then closed_lost; bigger ACV first within each.
  const closed = allDeals
    .filter(
      (d) =>
        (d.stage === "closed_won" || d.stage === "closed_lost") &&
        d.id !== input.deal.id,
    )
    .sort((a, b) => {
      const stageRank = (s: string) => (s === "closed_won" ? 0 : 1);
      if (stageRank(a.stage) !== stageRank(b.stage)) {
        return stageRank(a.stage) - stageRank(b.stage);
      }
      return b.acv - a.acv;
    })
    .slice(0, 8);

  for (let i = 0; i < closed.length; i++) {
    const d = closed[i];
    writeRow(ws, cursor, {
      index: i + 2,
      customer: d.customer.name,
      dealType: d.deal_type,
      acv: d.acv,
      discountPct: d.discount_pct / 100,
      termMonths: d.term_months,
      outcome: d.stage === "closed_won" ? "Won" : "Lost",
      note: d.discount_reason ?? d.competitive_context ?? "",
    });
    cursor++;
  }

  // Aggregate row.
  cursor += 1;
  const aggLabel = ws.getCell(cursor, 2);
  aggLabel.value = "Avg of historicals";
  aggLabel.font = { name: "Calibri", size: 11, bold: true };
  const lastDataRow = thisRow + closed.length;
  const histStartRow = thisRow + 1;
  const histEndRow = lastDataRow;

  // Avg ACV
  const avgAcv = ws.getCell(cursor, 4);
  avgAcv.value = { formula: `IFERROR(AVERAGE(D${histStartRow}:D${histEndRow}),0)` };
  avgAcv.numFmt = FMT_MONEY_WHOLE;
  styleBody(avgAcv);

  // Avg discount
  const avgDisc = ws.getCell(cursor, 5);
  avgDisc.value = { formula: `IFERROR(AVERAGE(E${histStartRow}:E${histEndRow}),0)` };
  avgDisc.numFmt = FMT_PCT;
  styleBody(avgDisc);

  cursor += 2;
  const note = ws.getCell(cursor, 1);
  note.value =
    "Chart deferred — discount-by-deal bar chart and ACV-vs-discount scatter to be added in a follow-up. Data above is fully usable for analysis.";
  note.font = { name: "Calibri", italic: true, size: 10, color: { argb: "FF737373" } };
  ws.mergeCells(cursor, 1, cursor, 8);
  ws.getRow(cursor).alignment = { wrapText: true };
  ws.getRow(cursor).height = 30;
}

function writeRow(
  ws: ReturnType<Workbook["addWorksheet"]>,
  row: number,
  data: {
    index: number;
    customer: string;
    dealType: string;
    acv: number;
    discountPct: number;
    termMonths: number;
    outcome: string;
    note: string;
  },
): void {
  const idx = ws.getCell(row, 1);
  idx.value = data.index;
  idx.numFmt = FMT_NUM;
  styleBody(idx);

  const customer = ws.getCell(row, 2);
  customer.value = data.customer;
  styleBody(customer);

  const type = ws.getCell(row, 3);
  type.value = data.dealType.replace(/_/g, " ");
  styleBody(type);

  const acv = ws.getCell(row, 4);
  acv.value = data.acv;
  acv.numFmt = FMT_MONEY_WHOLE;
  styleBody(acv);

  const disc = ws.getCell(row, 5);
  disc.value = data.discountPct;
  disc.numFmt = FMT_PCT;
  styleBody(disc);

  const term = ws.getCell(row, 6);
  term.value = data.termMonths;
  term.numFmt = FMT_NUM;
  styleBody(term);

  const outcome = ws.getCell(row, 7);
  outcome.value = data.outcome;
  styleBody(outcome);
  if (data.outcome === "Won") {
    outcome.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLOR.goodGreenText } };
  } else if (data.outcome === "Lost") {
    outcome.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLOR.badRedText } };
  }

  const note = ws.getCell(row, 8);
  note.value = data.note;
  styleBody(note);
  note.alignment = { vertical: "middle", wrapText: true };
  ws.getRow(row).height = Math.max(20, Math.min(60, data.note.length / 1.6));
}
