import type { Workbook } from "exceljs";
import type { ArtifactInput } from "../types";
import {
  addTitleRow,
  COLOR,
  FMT_DATE,
  FMT_MONEY,
  FMT_NUM,
  setColumnWidths,
  styleBody,
  styleCalc,
  styleHeader,
  styleLabel,
  styleMono,
} from "./styles";

// Tab 3 — ASC 606 Revenue Recognition Schedule. THE LIVE-FORMULAS TAB.
// Every monthly row references the Pricing Model tab via cross-sheet
// formulas, so editing Tab 2's discount cell rolls all 36 months on
// this tab forward. Reconciliation row at the bottom validates that
// the sum of recognized revenue equals TCV.

interface BuildOptions {
  pricingModelTab: string;
}

export function buildAsc606ScheduleTab(
  workbook: Workbook,
  input: ArtifactInput,
  tabName: string,
  opts: BuildOptions,
): void {
  const ws = workbook.addWorksheet(tabName);
  setColumnWidths(ws, [10, 14, 16, 18, 18, 18, 18, 20, 20, 36]);

  let cursor = addTitleRow(
    ws,
    "ASC 606 Revenue Recognition Schedule",
    "Live formulas reference the Pricing Model tab. Edit Tab 2's discount and watch this tab roll forward.",
  );

  // Header row.
  const headers = [
    "Month #",
    "Calendar",
    "Phase",
    "Subscription rev",
    "Usage rev (est.)",
    "Variable adj.",
    "Total recognized",
    "Cumulative",
    "Deferred bal.",
    "Notes",
  ];
  for (let i = 0; i < headers.length; i++) {
    const c = ws.getCell(cursor, i + 1);
    c.value = headers[i];
    styleHeader(c);
  }
  const headerRow = cursor;
  cursor++;

  // Cross-sheet refs for the Pricing Model tab. Excel needs single quotes
  // around tab names with spaces. Absolute addressing ($col$row) so the
  // formulas stay anchored to the input cells when sheet rows shift.
  const pm = (col: string, row: number) => `'${opts.pricingModelTab}'!$${col}$${row}`;

  // Pull static input values — these define the row count we materialize
  // (= max term among scenario candidates, capped at 36 for layout).
  const termMonths = Math.min(36, Math.max(12, input.deal.term_months));

  // Anchor month: use deal.created_at year/month if present; else generated_at.
  const anchorIso = input.deal.created_at ?? input.generatedAt.toISOString();
  const anchor = new Date(anchorIso);
  const anchorYear = anchor.getFullYear();
  const anchorMonth = anchor.getMonth() + 1; // 1-indexed for DATE()

  // Per-month formulas. Column letters:
  //   A month#   B calendar   C phase
  //   D subscription   E usage   F variable adj
  //   G total = D+E+F   H cumulative = G_prev + G   I deferred = cum_billed - H
  //   J notes
  const firstDataRow = cursor;
  for (let m = 1; m <= termMonths; m++) {
    const r = cursor;

    // A — month index (constant; not user-editable in the spec)
    const monthIdx = ws.getCell(r, 1);
    monthIdx.value = m;
    monthIdx.numFmt = FMT_NUM;
    styleMono(monthIdx);

    // B — calendar month derived from anchor + month#-1
    const cal = ws.getCell(r, 2);
    cal.value = { formula: `DATE(${anchorYear},${anchorMonth}+A${r}-1,1)` };
    cal.numFmt = FMT_DATE;
    styleCalc(cal);

    // C — phase: Free if month ≤ free, Ramp if next ramp_months, else Standard.
    // Reference the Pricing Model inputs by absolute address.
    const phase = ws.getCell(r, 3);
    phase.value = {
      formula:
        `IF(A${r}<=${pm("B", 8)},"Free",` +
        `IF(A${r}<=${pm("B", 8)}+${pm("B", 6)},"Ramp",` +
        `"Standard"))`,
    };
    styleBody(phase);

    // D — subscription revenue this month.
    // Free → 0; Ramp → discountedMonthly * rampMult; Standard → discountedMonthly
    // (with annual escalator applied via FLOOR((m-1)/12) when escalator > 0)
    const sub = ws.getCell(r, 4);
    sub.value = {
      formula:
        `IF(A${r}>${pm("B", 5)},0,` +
        `IF(A${r}<=${pm("B", 8)},0,` +
        `IF(A${r}<=${pm("B", 8)}+${pm("B", 6)},` +
        `${pm("D", 3)}/12*${pm("B", 7)},` +
        `${pm("D", 3)}/12*POWER(1+${pm("B", 9)},FLOOR((A${r}-1)/12,1)))))`,
    };
    sub.numFmt = FMT_MONEY;
    styleCalc(sub);

    // E — usage revenue (estimate). Set to 0 by default for the demo;
    // the visitor can edit per-month.
    const usage = ws.getCell(r, 5);
    usage.value = 0;
    usage.numFmt = FMT_MONEY;
    styleCalc(usage);

    // F — variable consideration adjustment (rollover/true-up). 0 by default.
    const varAdj = ws.getCell(r, 6);
    varAdj.value = 0;
    varAdj.numFmt = FMT_MONEY;
    styleCalc(varAdj);

    // G — total recognized this month
    const total = ws.getCell(r, 7);
    total.value = { formula: `D${r}+E${r}+F${r}` };
    total.numFmt = FMT_MONEY;
    styleCalc(total);

    // H — cumulative recognized
    const cum = ws.getCell(r, 8);
    if (m === 1) {
      cum.value = { formula: `G${r}` };
    } else {
      cum.value = { formula: `H${r - 1}+G${r}` };
    }
    cum.numFmt = FMT_MONEY;
    styleCalc(cum);

    // I — deferred revenue balance
    // Cumulative billed: assume annual-in-advance billing → bills the full
    // year's contracted ACV at month 1, then year-2 at month 13, year-3
    // at month 25. Simplification keeps the formula readable.
    // billed_through_month = ceiling(month/12) * year_acv (capped at TCV)
    const deferred = ws.getCell(r, 9);
    const yearIdx = Math.ceil(m / 12); // 1, 2, or 3
    const billedFormula =
      yearIdx === 1
        ? `${pm("D", 5)}`
        : yearIdx === 2
          ? `${pm("D", 5)}+${pm("D", 6)}`
          : `${pm("D", 5)}+${pm("D", 6)}+${pm("D", 7)}`;
    deferred.value = { formula: `${billedFormula}-H${r}` };
    deferred.numFmt = FMT_MONEY;
    styleCalc(deferred);

    // J — notes (static per phase)
    const notes = ws.getCell(r, 10);
    if (m === 1) {
      notes.value = "Contract start";
    } else if (m === 13) {
      notes.value = "Year 2 begins";
    } else if (m === 25) {
      notes.value = "Year 3 begins";
    } else {
      notes.value = "";
    }
    styleBody(notes);

    cursor++;
  }
  const lastDataRow = cursor - 1;

  // Subtotal row.
  cursor++; // gap
  const subtotalRow = cursor;
  const totalLabel = ws.getCell(subtotalRow, 3);
  totalLabel.value = "Subtotal";
  styleLabel(totalLabel);
  for (const col of [4, 5, 6, 7]) {
    const c = ws.getCell(subtotalRow, col);
    const colLetter = String.fromCharCode(64 + col);
    c.value = { formula: `SUM(${colLetter}${firstDataRow}:${colLetter}${lastDataRow})` };
    c.numFmt = FMT_MONEY;
    styleCalc(c);
    c.font = { name: "Calibri", size: 11, bold: true };
  }
  cursor++;

  // Reconciliation row — does sum-of-G equal TCV?
  cursor++; // gap
  const reconLabel = ws.getCell(cursor, 3);
  reconLabel.value = "Reconciliation";
  styleLabel(reconLabel);

  const reconCell = ws.getCell(cursor, 4);
  // Tolerance of 1 cent to handle floating-point rounding in formulas.
  reconCell.value = {
    formula:
      `IF(ABS(SUM(G${firstDataRow}:G${lastDataRow})-${pm("D", 8)})<0.01,` +
      `"Reconciles to TCV","Mismatch — check inputs")`,
  };
  reconCell.font = { name: "Calibri", size: 11, bold: true };
  reconCell.alignment = { vertical: "middle" };
  ws.mergeCells(cursor, 4, cursor, 7);

  // Conditional formatting on the reconciliation cell.
  ws.addConditionalFormatting({
    ref: `D${cursor}`,
    rules: [
      {
        type: "containsText",
        operator: "containsText",
        priority: 1,
        text: "Reconciles",
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: COLOR.goodGreen } },
          font: { color: { argb: COLOR.goodGreenText }, bold: true },
        },
      },
      {
        type: "containsText",
        operator: "containsText",
        priority: 2,
        text: "Mismatch",
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: COLOR.badRed } },
          font: { color: { argb: COLOR.badRedText }, bold: true },
        },
      },
    ],
  });
  cursor++;

  // Chart: bar chart of recognized revenue by quarter. exceljs's chart
  // creation API is incomplete across versions — defer per the brief's
  // explicit "skip charts if gnarly" guidance. The data table above is
  // the operator-grade source of truth; a chart in a later phase would
  // sit alongside it without restructuring.
  cursor += 2;
  const chartNote = ws.getCell(cursor, 1);
  chartNote.value = "Chart deferred — bar chart of recognized revenue by quarter to be added in a follow-up. Data above is fully usable.";
  chartNote.font = { name: "Calibri", italic: true, size: 10, color: { argb: "FF737373" } };
  ws.mergeCells(cursor, 1, cursor, 10);
}
