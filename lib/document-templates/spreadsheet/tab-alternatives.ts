import type { Workbook } from "exceljs";
import type { ArtifactInput } from "../types";
import {
  addTitleRow,
  COLOR,
  FMT_MONEY_WHOLE,
  FMT_PCT,
  setColumnWidths,
  styleBody,
  styleCalc,
  styleHeader,
  styleLabel,
} from "./styles";

// Tab 4 — Alternative Structures. Side-by-side comparison.
//
// Columns:
//   A label
//   B "As Proposed"   (the deal's headline values from PricingOutput)
//   C Alt 1
//   D Alt 2
//   E Alt 3            (when the agent emitted three alternatives;
//                       blank otherwise)
//
// Inputs (rows 4–8) are user-editable in the same way Tab 2's inputs
// are — yellow fills, plain numbers. Calculated outputs (rows 10–15)
// derive from the column's own input block, not from Tab 2 — each
// column is a self-contained model so the visitor can tweak Alt 2's
// discount independently.
//
// Winner / loser highlighting: row 10 (TCV) → highest TCV is green;
// row 13 (Margin %) → lowest margin is red.

export function buildAlternativesTab(
  workbook: Workbook,
  input: ArtifactInput,
  tabName: string,
): void {
  const ws = workbook.addWorksheet(tabName);
  setColumnWidths(ws, [34, 22, 22, 22, 22]);

  let cursor = addTitleRow(
    ws,
    "Alternative Structures",
    "As-Proposed vs the Pricing Agent's alternatives. Each column is its own self-contained mini-model.",
  );

  // Column headers — row at `cursor`.
  const colTitles = ["", "As Proposed", "Alt 1", "Alt 2", "Alt 3"];
  for (let i = 0; i < colTitles.length; i++) {
    const c = ws.getCell(cursor, i + 1);
    c.value = colTitles[i];
    styleHeader(c);
    c.alignment = { horizontal: "center", vertical: "middle" };
  }
  cursor++;

  // Build the four columns. As-Proposed pulls from PricingOutput; the
  // alternatives come from PricingOutput.alternative_structures.
  const baseline = {
    label: "As Proposed",
    listPrice: input.pricing.list_price,
    proposedPrice: input.pricing.proposed_price,
    effectiveDiscountPct: input.pricing.effective_discount_pct / 100,
    marginPctEstimate: input.pricing.margin_pct_estimate / 100,
    description: "Headline structure submitted by AE",
    rationale: input.pricing.reasoning_summary,
  };
  const alts = (input.pricing.alternative_structures ?? []).slice(0, 3);

  type Col = {
    listPrice: number;
    discountPct: number;
    rationale: string;
    description: string;
  };
  const cols: Col[] = [
    {
      listPrice: baseline.listPrice,
      discountPct: baseline.effectiveDiscountPct,
      rationale: baseline.rationale,
      description: baseline.description,
    },
    ...alts.map((a) => ({
      listPrice: input.pricing.list_price,
      discountPct: a.effective_discount_pct / 100,
      rationale: a.rationale,
      description: a.description,
    })),
  ];
  // Pad to exactly 4 columns so the table reads consistently even if the
  // agent only produced 2 alternatives.
  while (cols.length < 4) {
    cols.push({ listPrice: 0, discountPct: 0, rationale: "", description: "(no alternative)" });
  }

  // ---- Inputs block (rows c .. c+5) ---------------------------------
  const inputsHeader = ws.getCell(cursor, 1);
  inputsHeader.value = "INPUTS";
  inputsHeader.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF737373" } };
  cursor++;

  const inputRows: Array<{ label: string; key: keyof Col; fmt: string }> = [
    { label: "List price (annual)", key: "listPrice", fmt: FMT_MONEY_WHOLE },
    { label: "Discount %", key: "discountPct", fmt: FMT_PCT },
  ];

  // Hard-coded ramp / free / escalator parameters per alternative — these
  // tabs don't deepen the alt data shape, so we replicate Tab 2's defaults
  // across columns. Visitor can edit per-column.
  const sharedDefaults = {
    rampMonths: 0,
    rampMultiplier: 0.5,
    freeMonths: 0,
    annualEscalator: 0,
    marginAtList: 0.4,
    termMonths: input.deal.term_months,
  };

  // Row addresses — exposed so the calc block below can reference them.
  const inputAnchor = cursor;

  for (const r of inputRows) {
    const lbl = ws.getCell(cursor, 1);
    lbl.value = r.label;
    styleLabel(lbl);
    for (let cIdx = 0; cIdx < cols.length; cIdx++) {
      const cell = ws.getCell(cursor, 2 + cIdx);
      const val = cols[cIdx][r.key] as number;
      cell.value = val;
      cell.numFmt = r.fmt;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.inputYellow } };
      cell.border = {
        top: { style: "thin", color: { argb: COLOR.border } },
        left: { style: "thin", color: { argb: COLOR.border } },
        bottom: { style: "thin", color: { argb: COLOR.border } },
        right: { style: "thin", color: { argb: COLOR.border } },
      };
      cell.font = { name: "Calibri", size: 11 };
    }
    cursor++;
  }

  // Term + ramp + escalator + margin — same value across columns by
  // default, but each is its own editable cell so the visitor can vary.
  const sharedRows: Array<{ label: string; value: number; fmt: string }> = [
    { label: "Term (months)", value: sharedDefaults.termMonths, fmt: "#,##0" },
    { label: "Ramp months", value: sharedDefaults.rampMonths, fmt: "#,##0" },
    { label: "Ramp multiplier", value: sharedDefaults.rampMultiplier, fmt: "0.00" },
    { label: "Free months", value: sharedDefaults.freeMonths, fmt: "#,##0" },
    { label: "Annual escalator", value: sharedDefaults.annualEscalator, fmt: FMT_PCT },
    { label: "Margin at list", value: sharedDefaults.marginAtList, fmt: FMT_PCT },
  ];

  for (const r of sharedRows) {
    const lbl = ws.getCell(cursor, 1);
    lbl.value = r.label;
    styleLabel(lbl);
    for (let cIdx = 0; cIdx < cols.length; cIdx++) {
      const cell = ws.getCell(cursor, 2 + cIdx);
      cell.value = r.value;
      cell.numFmt = r.fmt;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.inputYellow } };
      cell.border = {
        top: { style: "thin", color: { argb: COLOR.border } },
        left: { style: "thin", color: { argb: COLOR.border } },
        bottom: { style: "thin", color: { argb: COLOR.border } },
        right: { style: "thin", color: { argb: COLOR.border } },
      };
      cell.font = { name: "Calibri", size: 11 };
    }
    cursor++;
  }

  // Compute the row addresses of each input row for use in formulas.
  const ROW_LIST = inputAnchor + 0;
  const ROW_DISCOUNT = inputAnchor + 1;
  const ROW_TERM = inputAnchor + 2;
  const ROW_RAMP_MO = inputAnchor + 3;
  const ROW_RAMP_MULT = inputAnchor + 4;
  const ROW_FREE = inputAnchor + 5;
  const ROW_ESC = inputAnchor + 6;
  const ROW_MARGIN_AT_LIST = inputAnchor + 7;

  // ---- Calculated outputs block ------------------------------------
  cursor++;
  const outputsHeader = ws.getCell(cursor, 1);
  outputsHeader.value = "CALCULATED";
  outputsHeader.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF737373" } };
  cursor++;

  // Helper: per-column formula builder. col is 1..4 (1 = column B, …).
  // Returns the column letter for use in inline formulas — column 1 maps
  // to B (offset by the label column at A).
  const colLetter = (i: number) => String.fromCharCode("B".charCodeAt(0) + i);

  // Discounted price (annual): list * (1 - discount)
  const discountedRow = cursor;
  const discountedLabel = ws.getCell(cursor, 1);
  discountedLabel.value = "Discounted price (annual)";
  styleLabel(discountedLabel);
  for (let cIdx = 0; cIdx < cols.length; cIdx++) {
    const c = ws.getCell(cursor, 2 + cIdx);
    const col = colLetter(cIdx);
    c.value = { formula: `${col}${ROW_LIST}*(1-${col}${ROW_DISCOUNT})` };
    c.numFmt = FMT_MONEY_WHOLE;
    styleCalc(c);
  }
  cursor++;

  // Y1 ACV
  const y1Row = cursor;
  const y1Label = ws.getCell(cursor, 1);
  y1Label.value = "Year 1 ACV";
  styleLabel(y1Label);
  for (let cIdx = 0; cIdx < cols.length; cIdx++) {
    const c = ws.getCell(cursor, 2 + cIdx);
    const col = colLetter(cIdx);
    c.value = {
      formula:
        `${col}${discountedRow}/12*` +
        `(MAX(0,12-${col}${ROW_FREE}-${col}${ROW_RAMP_MO})+${col}${ROW_RAMP_MO}*${col}${ROW_RAMP_MULT})`,
    };
    c.numFmt = FMT_MONEY_WHOLE;
    styleCalc(c);
  }
  cursor++;

  // TCV
  const tcvRow = cursor;
  const tcvLabel = ws.getCell(cursor, 1);
  tcvLabel.value = "TCV";
  styleLabel(tcvLabel);
  for (let cIdx = 0; cIdx < cols.length; cIdx++) {
    const c = ws.getCell(cursor, 2 + cIdx);
    const col = colLetter(cIdx);
    c.value = {
      formula:
        `${col}${y1Row}+IF(${col}${ROW_TERM}>=24,${col}${discountedRow}*(1+${col}${ROW_ESC}),0)+IF(${col}${ROW_TERM}>=36,${col}${discountedRow}*POWER(1+${col}${ROW_ESC},2),0)`,
    };
    c.numFmt = FMT_MONEY_WHOLE;
    styleCalc(c);
  }
  cursor++;

  // Effective discount over term
  const effDiscRow = cursor;
  const effDiscLabel = ws.getCell(cursor, 1);
  effDiscLabel.value = "Effective discount %";
  styleLabel(effDiscLabel);
  for (let cIdx = 0; cIdx < cols.length; cIdx++) {
    const c = ws.getCell(cursor, 2 + cIdx);
    const col = colLetter(cIdx);
    c.value = {
      formula:
        `1-(1-${col}${ROW_DISCOUNT})*` +
        `((${col}${ROW_TERM}-${col}${ROW_FREE}-${col}${ROW_RAMP_MO})+${col}${ROW_RAMP_MO}*${col}${ROW_RAMP_MULT})/${col}${ROW_TERM}`,
    };
    c.numFmt = FMT_PCT;
    styleCalc(c);
  }
  cursor++;

  // Margin %
  const marginPctRow = cursor;
  const marginLabel = ws.getCell(cursor, 1);
  marginLabel.value = "Margin %";
  styleLabel(marginLabel);
  for (let cIdx = 0; cIdx < cols.length; cIdx++) {
    const c = ws.getCell(cursor, 2 + cIdx);
    const col = colLetter(cIdx);
    c.value = {
      formula: `1-(1-${col}${ROW_MARGIN_AT_LIST})/(1-${col}${ROW_DISCOUNT})`,
    };
    c.numFmt = FMT_PCT;
    styleCalc(c);
  }
  cursor++;

  // Margin $
  const marginDollarsRow = cursor;
  const marginDLabel = ws.getCell(cursor, 1);
  marginDLabel.value = "Margin $";
  styleLabel(marginDLabel);
  for (let cIdx = 0; cIdx < cols.length; cIdx++) {
    const c = ws.getCell(cursor, 2 + cIdx);
    const col = colLetter(cIdx);
    c.value = { formula: `${col}${tcvRow}*${col}${marginPctRow}` };
    c.numFmt = FMT_MONEY_WHOLE;
    styleCalc(c);
  }
  cursor++;

  // Winner highlight on the TCV row (highest TCV → green).
  applyMaxHighlight(ws, tcvRow, 2, 2 + cols.length - 1, COLOR.winnerHighlight);
  // Loser highlight on the Margin % row (lowest margin → red).
  applyMinHighlight(ws, marginPctRow, 2, 2 + cols.length - 1, COLOR.loserHighlight);

  // ---- Description / rationale block --------------------------------
  cursor += 1;
  const descHeader = ws.getCell(cursor, 1);
  descHeader.value = "DESCRIPTION";
  descHeader.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF737373" } };
  cursor++;
  const descLabel = ws.getCell(cursor, 1);
  descLabel.value = "Description";
  styleLabel(descLabel);
  for (let cIdx = 0; cIdx < cols.length; cIdx++) {
    const c = ws.getCell(cursor, 2 + cIdx);
    c.value = cols[cIdx].description;
    styleBody(c);
    c.alignment = { vertical: "top", wrapText: true };
  }
  ws.getRow(cursor).height = 50;
  cursor++;

  const ratLabel = ws.getCell(cursor, 1);
  ratLabel.value = "Rationale";
  styleLabel(ratLabel);
  for (let cIdx = 0; cIdx < cols.length; cIdx++) {
    const c = ws.getCell(cursor, 2 + cIdx);
    c.value = cols[cIdx].rationale;
    styleBody(c);
    c.alignment = { vertical: "top", wrapText: true };
  }
  ws.getRow(cursor).height = 90;
  cursor++;

  // Suppress unused warning for the unused locals in case TS is strict.
  void marginDollarsRow;
  void effDiscRow;
}

// Apply a fill to whichever cell in [colStart..colEnd] (1-indexed) on the
// given row holds the maximum value in that range. Used for winner
// highlighting on the TCV row.
function applyMaxHighlight(
  ws: ReturnType<Workbook["addWorksheet"]>,
  row: number,
  colStart: number,
  colEnd: number,
  bgColor: string,
): void {
  const startLetter = String.fromCharCode(64 + colStart);
  const endLetter = String.fromCharCode(64 + colEnd);
  const range = `${startLetter}${row}:${endLetter}${row}`;
  ws.addConditionalFormatting({
    ref: range,
    rules: [
      {
        type: "expression",
        priority: 1,
        formulae: [`${startLetter}${row}=MAX($${startLetter}$${row}:$${endLetter}$${row})`],
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: bgColor } },
          font: { bold: true },
        },
      },
    ],
  });
}

function applyMinHighlight(
  ws: ReturnType<Workbook["addWorksheet"]>,
  row: number,
  colStart: number,
  colEnd: number,
  bgColor: string,
): void {
  const startLetter = String.fromCharCode(64 + colStart);
  const endLetter = String.fromCharCode(64 + colEnd);
  const range = `${startLetter}${row}:${endLetter}${row}`;
  ws.addConditionalFormatting({
    ref: range,
    rules: [
      {
        type: "expression",
        priority: 1,
        formulae: [`${startLetter}${row}=MIN($${startLetter}$${row}:$${endLetter}$${row})`],
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: bgColor } },
          font: { bold: true },
        },
      },
    ],
  });
}
