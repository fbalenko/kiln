// Shared cell style helpers for the financial-model workbook.
// Every tab-builder pulls from here so the visual register stays consistent
// across all 10 tabs.

import type { Cell, Worksheet, Borders } from "exceljs";

// Brand colors mirroring app/globals.css. exceljs uses ARGB hex with the
// alpha channel first ("FF" prefix = fully opaque).
export const COLOR = {
  brand: "FF3B82F6",
  brandLight: "FFDBEAFE",
  inputYellow: "FFFEF3C7",      // Light amber — input cells the visitor edits
  calcWhite: "FFFFFFFF",         // Calculated cells
  headerGray: "FFF5F5F5",        // Section headers
  headerDark: "FF0A0A0A",        // Title row text
  border: "FFE5E5E5",
  goodGreen: "FFDCFCE7",         // Severity green bg
  goodGreenText: "FF15803D",
  warnAmber: "FFFEF3C7",         // Severity amber bg
  warnAmberText: "FFA16207",
  badRed: "FFFEE2E2",            // Severity red bg
  badRedText: "FFB91C1C",
  winnerHighlight: "FFD1FAE5",   // Tab 4 winner cell highlight
  loserHighlight: "FFFECACA",    // Tab 4 loser cell highlight
} as const;

const FONT_DEFAULT = { name: "Calibri", size: 11 };
const FONT_HEADER = { name: "Calibri", size: 14, bold: true };
const FONT_TITLE = { name: "Calibri", size: 18, bold: true };
const FONT_LABEL = { name: "Calibri", size: 11, bold: true };
const FONT_MONO = { name: "Consolas", size: 10 };

const THIN_BORDER: Partial<Borders> = {
  top: { style: "thin", color: { argb: COLOR.border } },
  left: { style: "thin", color: { argb: COLOR.border } },
  bottom: { style: "thin", color: { argb: COLOR.border } },
  right: { style: "thin", color: { argb: COLOR.border } },
};

// Apply tile-grade styling to a header cell — used for tab section titles
// and table column headers.
export function styleHeader(cell: Cell): void {
  cell.font = FONT_HEADER;
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLOR.headerGray },
  };
  cell.alignment = { vertical: "middle" };
  cell.border = THIN_BORDER;
}

// Tab title — the big bold row at the top of each tab.
export function styleTitle(cell: Cell): void {
  cell.font = FONT_TITLE;
  cell.alignment = { vertical: "middle" };
}

// Bold label cell (left column of metadata blocks).
export function styleLabel(cell: Cell): void {
  cell.font = FONT_LABEL;
  cell.alignment = { vertical: "middle" };
}

// Yellow-fill input cell — the visitor edits these.
export function styleInput(cell: Cell): void {
  cell.font = FONT_DEFAULT;
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLOR.inputYellow },
  };
  cell.border = THIN_BORDER;
  cell.alignment = { vertical: "middle" };
}

// White-fill calculated cell — formula-driven.
export function styleCalc(cell: Cell): void {
  cell.font = FONT_DEFAULT;
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLOR.calcWhite },
  };
  cell.border = THIN_BORDER;
  cell.alignment = { vertical: "middle" };
}

// Default body cell — no fill, just default font + border.
export function styleBody(cell: Cell): void {
  cell.font = FONT_DEFAULT;
  cell.alignment = { vertical: "middle" };
  cell.border = THIN_BORDER;
}

// Mono cell — for IDs, codes, filename suffixes.
export function styleMono(cell: Cell): void {
  cell.font = FONT_MONO;
  cell.alignment = { vertical: "middle" };
  cell.border = THIN_BORDER;
}

// Money / accounting format with two decimals.
export const FMT_MONEY = '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)';
// Money rounded to whole dollars — for big TCV / ACV cells.
export const FMT_MONEY_WHOLE = '_($* #,##0_);_($* (#,##0);_($* "-"_);_(@_)';
// Percentage with one decimal.
export const FMT_PCT = "0.0%";
// Date format.
export const FMT_DATE = "mmm yyyy";
// Number with thousand separators.
export const FMT_NUM = "#,##0";

// Set column widths from a list of pixel-ish numbers (exceljs uses character
// units; this is a rough conversion at 7px per character).
export function setColumnWidths(ws: Worksheet, widths: number[]): void {
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

// Add a "title row" — big bold tab heading + subtitle. Returns the next
// free row index so callers can chain.
export function addTitleRow(
  ws: Worksheet,
  title: string,
  subtitle?: string,
): number {
  const titleCell = ws.getCell("A1");
  titleCell.value = title;
  styleTitle(titleCell);
  ws.getRow(1).height = 26;

  if (subtitle) {
    const sub = ws.getCell("A2");
    sub.value = subtitle;
    sub.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF737373" } };
    return 4;
  }
  return 3;
}
