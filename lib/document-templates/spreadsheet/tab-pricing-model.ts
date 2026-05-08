import type { Workbook } from "exceljs";
import type { ArtifactInput } from "../types";
import {
  COLOR,
  FMT_MONEY,
  FMT_MONEY_WHOLE,
  FMT_NUM,
  FMT_PCT,
  setColumnWidths,
  styleBody,
  styleCalc,
  styleInput,
  styleLabel,
  addTitleRow,
} from "./styles";

// Tab 2 — Pricing Model. THE LIVE-FORMULAS TAB.
//
// Inputs in column B (rows 3..10) are yellow-highlighted; the visitor
// edits them and downstream tabs recalculate. Calculated outputs in
// column D (rows 3..11) are formula-driven from column B.
//
// Cell layout is exported as a constant (PRICING_CELLS) so other tabs
// can reference inputs/outputs without hardcoding cell addresses across
// the codebase.

export const PRICING_CELLS = {
  // Inputs (yellow)
  listPrice: "B3",          // annual list price, USD
  discountPct: "B4",        // decimal, e.g., 0.15 for 15%
  termMonths: "B5",         // integer
  rampMonths: "B6",          // integer
  rampMultiplier: "B7",     // decimal, e.g., 0.5
  freeMonths: "B8",         // integer
  annualEscalator: "B9",    // decimal, default 0
  marginAtList: "B10",      // decimal, e.g., 0.40

  // Calculated (white)
  discountedPrice: "D3",         // annual proposed price after headline discount
  effectiveDiscount: "D4",       // overall % off list across the term
  y1Acv: "D5",
  y2Acv: "D6",
  y3Acv: "D7",
  tcv: "D8",
  marginDollars: "D9",
  marginPct: "D10",
  marginHaircut: "D11",
} as const;

export function buildPricingModelTab(
  workbook: Workbook,
  input: ArtifactInput,
  tabName: string,
): void {
  const ws = workbook.addWorksheet(tabName);
  setColumnWidths(ws, [38, 18, 4, 22, 26]);

  // Title rows — title at A1, helper subtitle at A2. The helper section
  // below starts at row addTitleRow returns (= 4 with subtitle).
  let cursor = addTitleRow(
    ws,
    "Pricing Model",
    "Yellow cells are inputs. Edit them and the calculated cells (and Tab 3 ASC 606 schedule) recalculate.",
  );

  // Section: Inputs — columns A (label), B (value).
  const inputsHeader = ws.getCell(cursor - 1, 1);
  inputsHeader.value = "INPUTS";
  inputsHeader.font = {
    name: "Calibri",
    size: 10,
    bold: true,
    color: { argb: "FF737373" },
  };

  // Pull initial values from the cached PricingOutput where applicable.
  const { pricing, deal } = input;
  const ramp = ramp_months_from_payment(deal.payment_terms_notes);
  const freeMonths = 0;
  const escalator = 0;
  const marginAtList = pricing.margin_pct_estimate / 100 + (pricing.effective_discount_pct / 100);
  // Reverse the discount-margin formula: m_at_list = 1 - (1 - margin_pct) * (1 - discount_pct)
  // Simpler: just use 0.40 as the documented default; the cached margin
  // already absorbs the discount, so deriving back can over-correct.
  // Use the documented baseline so the model matches the doc note.
  const marginBaseline = 0.4;

  const inputRows: Array<[string, number, string, string, number]> = [
    // [label, value, format, cell, _index]
    ["List price (annual, USD)", pricing.list_price, FMT_MONEY_WHOLE, PRICING_CELLS.listPrice, 0],
    ["Discount % (decimal)", pricing.effective_discount_pct / 100, FMT_PCT, PRICING_CELLS.discountPct, 1],
    ["Term length (months)", deal.term_months, FMT_NUM, PRICING_CELLS.termMonths, 2],
    ["Ramp length (months)", ramp, FMT_NUM, PRICING_CELLS.rampMonths, 3],
    ["Ramp price multiplier", 0.5, "0.00", PRICING_CELLS.rampMultiplier, 4],
    ["Free month count", freeMonths, FMT_NUM, PRICING_CELLS.freeMonths, 5],
    ["Annual price escalator", escalator, FMT_PCT, PRICING_CELLS.annualEscalator, 6],
    ["Assumed gross margin at list", marginBaseline, FMT_PCT, PRICING_CELLS.marginAtList, 7],
  ];

  for (const [label, value, fmt, cellAddr] of inputRows) {
    const row = parseRow(cellAddr);
    const lbl = ws.getCell(row, 1);
    lbl.value = label;
    styleLabel(lbl);

    const inp = ws.getCell(cellAddr);
    inp.value = value;
    inp.numFmt = fmt;
    styleInput(inp);
  }

  // Section: Calculated outputs in column D, with labels in C/D header row.
  const calcHeaderC = ws.getCell(cursor - 1, 4);
  calcHeaderC.value = "CALCULATED";
  calcHeaderC.font = {
    name: "Calibri",
    size: 10,
    bold: true,
    color: { argb: "FF737373" },
  };

  const calcRows: Array<{
    cell: string;
    label: string;
    formula: string;
    fmt: string;
  }> = [
    {
      cell: PRICING_CELLS.discountedPrice,
      label: "Discounted price (annual)",
      // = list * (1 - discount)
      formula: `${PRICING_CELLS.listPrice}*(1-${PRICING_CELLS.discountPct})`,
      fmt: FMT_MONEY_WHOLE,
    },
    {
      cell: PRICING_CELLS.effectiveDiscount,
      label: "Effective discount % over term",
      // Account for ramp + free months. The pre-discount value over term
      // would be list*(term/12). The post-discount value is the sum of:
      //   - free_months: 0
      //   - ramp_months: discounted_monthly * ramp_mult
      //   - rest:         discounted_monthly
      // Effective discount = 1 - actual_total / list_total
      // = 1 - (discounted/12 * ((term-free-ramp) + ramp*ramp_mult)) / (list * term/12)
      // = 1 - (1 - dpct) * ((term-free-ramp + ramp*ramp_mult) / term)
      formula:
        `1-(1-${PRICING_CELLS.discountPct})` +
        `*((${PRICING_CELLS.termMonths}-${PRICING_CELLS.freeMonths}-${PRICING_CELLS.rampMonths})` +
        `+${PRICING_CELLS.rampMonths}*${PRICING_CELLS.rampMultiplier})/${PRICING_CELLS.termMonths}`,
      fmt: FMT_PCT,
    },
    {
      cell: PRICING_CELLS.y1Acv,
      label: "Year 1 ACV",
      // Sum of months 1..min(12, term):
      //   For demo simplicity assume free <= 1 and ramp <= 6, both inside Y1.
      //   Y1 = (discounted/12) * ((12 - free - ramp) + ramp*ramp_mult)
      //   Clamp the inner counts at 0 with MAX so a long ramp doesn't go negative.
      formula:
        `${PRICING_CELLS.discountedPrice}/12*` +
        `(MAX(0,12-${PRICING_CELLS.freeMonths}-${PRICING_CELLS.rampMonths})+${PRICING_CELLS.rampMonths}*${PRICING_CELLS.rampMultiplier})`,
      fmt: FMT_MONEY_WHOLE,
    },
    {
      cell: PRICING_CELLS.y2Acv,
      label: "Year 2 ACV",
      // = discounted * (1 + escalator) when term >= 24, else 0.
      formula:
        `IF(${PRICING_CELLS.termMonths}>=24,` +
        `${PRICING_CELLS.discountedPrice}*(1+${PRICING_CELLS.annualEscalator}),0)`,
      fmt: FMT_MONEY_WHOLE,
    },
    {
      cell: PRICING_CELLS.y3Acv,
      label: "Year 3 ACV",
      formula:
        `IF(${PRICING_CELLS.termMonths}>=36,` +
        `${PRICING_CELLS.discountedPrice}*POWER(1+${PRICING_CELLS.annualEscalator},2),0)`,
      fmt: FMT_MONEY_WHOLE,
    },
    {
      cell: PRICING_CELLS.tcv,
      label: "TCV",
      formula: `${PRICING_CELLS.y1Acv}+${PRICING_CELLS.y2Acv}+${PRICING_CELLS.y3Acv}`,
      fmt: FMT_MONEY_WHOLE,
    },
    {
      cell: PRICING_CELLS.marginDollars,
      label: "Margin $ (full term)",
      // discounted gross margin% applied over TCV.
      // gross_margin% = 1 - (1 - margin_at_list)/(1 - discount_pct)
      formula:
        `${PRICING_CELLS.tcv}*(1-(1-${PRICING_CELLS.marginAtList})/(1-${PRICING_CELLS.discountPct}))`,
      fmt: FMT_MONEY_WHOLE,
    },
    {
      cell: PRICING_CELLS.marginPct,
      label: "Margin %",
      formula: `1-(1-${PRICING_CELLS.marginAtList})/(1-${PRICING_CELLS.discountPct})`,
      fmt: FMT_PCT,
    },
    {
      cell: PRICING_CELLS.marginHaircut,
      label: "Margin haircut from discount",
      formula: `${PRICING_CELLS.marginAtList}-${PRICING_CELLS.marginPct}`,
      fmt: FMT_PCT,
    },
  ];

  for (const { cell, label, formula, fmt } of calcRows) {
    const row = parseRow(cell);
    const lbl = ws.getCell(row, 4);
    lbl.value = label;
    styleLabel(lbl);
    const calc = ws.getCell(cell);
    calc.value = { formula };
    calc.numFmt = fmt;
    styleCalc(calc);
  }

  // Conditional formatting on D4 (effective discount) and D10 (margin %).
  // Severity thresholds match lib/severity.ts so the workbook's coloring
  // mirrors the deal-detail page's verdict tiles.
  applyDiscountConditionalFormatting(ws, PRICING_CELLS.effectiveDiscount);
  applyMarginConditionalFormatting(ws, PRICING_CELLS.marginPct);

  // Disclaimer cell at B14 per spec.
  const discRow = 14;
  const discLabel = ws.getCell(discRow, 1);
  discLabel.value = "Model assumption";
  styleLabel(discLabel);
  const disc = ws.getCell(`B${discRow}`);
  disc.value =
    `Margin calculations assume ${(marginBaseline * 100).toFixed(0)}% gross margin at list. ` +
    `Real margin depends on COGS not visible to this model — treat as directional.`;
  disc.font = { name: "Calibri", italic: true, size: 10, color: { argb: "FF737373" } };
  disc.alignment = { wrapText: true, vertical: "top" };
  ws.mergeCells(`B${discRow}:E${discRow}`);
  ws.getRow(discRow).height = 38;

  // Helper: an "About this tab" note explaining the live-formula contract
  // so the visitor knows what to edit.
  const aboutRow = 16;
  const about = ws.getCell(`A${aboutRow}`);
  about.value =
    "Edit any yellow cell. Calculated cells (white) and the ASC 606 Schedule on Tab 3 will recalculate.";
  about.font = { name: "Calibri", italic: true, size: 10, color: { argb: "FF3B82F6" } };
  ws.mergeCells(`A${aboutRow}:E${aboutRow}`);

  cursor = aboutRow + 2;
}

// ---- Helpers --------------------------------------------------------

// Parse the row index out of a cell address like "B7".
function parseRow(addr: string): number {
  const m = /[A-Z]+(\d+)/.exec(addr);
  if (!m) throw new Error(`Bad cell address: ${addr}`);
  return parseInt(m[1], 10);
}

// Best-effort estimate of ramp months from a free-text note. The seed
// payment_terms_notes column occasionally encodes "6-month ramp" — when
// present, surface that as the default ramp input. Otherwise default to 0.
function ramp_months_from_payment(notes: string | null | undefined): number {
  if (!notes) return 0;
  const m = /(\d+)[-\s]*month\s+ramp/i.exec(notes);
  if (m) return parseInt(m[1], 10);
  return 0;
}

// Conditional formatting: discount % thresholds. <20% green, 20–30% amber,
// >30% red. Mirrors discountSeverity() in lib/severity.ts.
function applyDiscountConditionalFormatting(
  ws: ReturnType<Workbook["addWorksheet"]>,
  cellAddr: string,
): void {
  ws.addConditionalFormatting({
    ref: cellAddr,
    rules: [
      {
        type: "cellIs",
        operator: "greaterThan",
        priority: 1,
        formulae: ["0.30"],
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: COLOR.badRed } },
          font: { color: { argb: COLOR.badRedText }, bold: true },
        },
      },
      {
        type: "cellIs",
        operator: "between",
        priority: 2,
        formulae: ["0.20", "0.30"],
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: COLOR.warnAmber } },
          font: { color: { argb: COLOR.warnAmberText }, bold: true },
        },
      },
      {
        type: "cellIs",
        operator: "lessThan",
        priority: 3,
        formulae: ["0.20"],
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: COLOR.goodGreen } },
          font: { color: { argb: COLOR.goodGreenText }, bold: true },
        },
      },
    ],
  });
}

// Conditional formatting: margin % thresholds. <25% red, 25–30% amber,
// ≥30% green. Mirrors marginSeverity() in lib/severity.ts.
function applyMarginConditionalFormatting(
  ws: ReturnType<Workbook["addWorksheet"]>,
  cellAddr: string,
): void {
  ws.addConditionalFormatting({
    ref: cellAddr,
    rules: [
      {
        type: "cellIs",
        operator: "lessThan",
        priority: 1,
        formulae: ["0.25"],
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: COLOR.badRed } },
          font: { color: { argb: COLOR.badRedText }, bold: true },
        },
      },
      {
        type: "cellIs",
        operator: "between",
        priority: 2,
        formulae: ["0.25", "0.30"],
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: COLOR.warnAmber } },
          font: { color: { argb: COLOR.warnAmberText }, bold: true },
        },
      },
      {
        // exceljs' cellIs operator set is {equal, greaterThan, lessThan,
        // between}. ≥0.30 expressed as `between(0.30, 1)` covers the
        // green band cleanly (margin % can't exceed 100%).
        type: "cellIs",
        operator: "between",
        priority: 3,
        formulae: ["0.30", "1"],
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: COLOR.goodGreen } },
          font: { color: { argb: COLOR.goodGreenText }, bold: true },
        },
      },
    ],
  });
}

// Re-export FMT_MONEY for ad-hoc use; keeps the import surface explicit.
export { FMT_MONEY };
