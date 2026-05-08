import type { Workbook } from "exceljs";
import type { ArtifactInput } from "../types";
import { getApprovalMatrix } from "@/lib/db/queries";
import {
  addTitleRow,
  FMT_NUM,
  setColumnWidths,
  styleBody,
  styleHeader,
  styleInput,
  styleMono,
} from "./styles";

// Tab 6 — Approval Matrix (EDITABLE). The full matrix as a table; visitor
// can edit any rule. Tab 5 (Approval Routing) reads from these cells, so
// flipping `Active` from TRUE to FALSE on a rule changes which approvers
// the routing tab surfaces.
//
// Cell convention: rows start at row 4 (after title + spacer + header row)
// and each rule is one row. Columns:
//   A  Rule name             (read-only)
//   B  Condition (label)     (read-only — the human-readable form)
//   C  Required approver     (editable cell, yellow)
//   D  Priority              (editable cell, yellow)
//   E  Active                (editable cell, yellow — TRUE/FALSE)
//   F  Notes                 (read-only)
//
// The first data row index (4) is exported as a constant so the routing
// tab knows where to scan.

// Layout: addTitleRow with subtitle returns 4, the header row consumes
// row 4, and the first data row is 5. Cross-tab consumers (Tab 5
// Approval Routing) reference this constant when building COUNTIF
// ranges over the matrix.
export const MATRIX_FIRST_DATA_ROW = 5;

export function buildApprovalMatrixTab(
  workbook: Workbook,
  _input: ArtifactInput,
  tabName: string,
): void {
  const ws = workbook.addWorksheet(tabName);
  setColumnWidths(ws, [42, 40, 22, 12, 12, 50]);

  let row = addTitleRow(
    ws,
    "Approval Matrix",
    "Editable. Changes flow to the Approval Routing tab via formulas.",
  );

  // Header row.
  const headers = ["Rule", "Condition", "Required approver", "Priority", "Active", "Notes"];
  for (let i = 0; i < headers.length; i++) {
    const c = ws.getCell(row, i + 1);
    c.value = headers[i];
    styleHeader(c);
  }
  row++;

  // First data row index recorded for cross-tab consumers.
  if (row !== MATRIX_FIRST_DATA_ROW) {
    // Defensive — the layout above puts data at row 4. If a future change
    // shifts the title rows, the constant must be updated together.
    throw new Error(
      `Approval Matrix tab layout drift: expected first data row ${MATRIX_FIRST_DATA_ROW}, got ${row}`,
    );
  }

  const rules = getApprovalMatrix();
  for (const rule of rules) {
    const ruleName = ws.getCell(row, 1);
    ruleName.value = rule.rule_name;
    styleBody(ruleName);

    const condition = ws.getCell(row, 2);
    condition.value = humanizeCondition(rule.condition_json);
    styleMono(condition);

    const approver = ws.getCell(row, 3);
    approver.value = rule.required_approver_role;
    styleInput(approver);

    const priority = ws.getCell(row, 4);
    priority.value = rule.rule_priority;
    priority.numFmt = FMT_NUM;
    styleInput(priority);

    const active = ws.getCell(row, 5);
    active.value = true;
    styleInput(active);

    const notes = ws.getCell(row, 6);
    notes.value = rule.notes ?? "";
    styleBody(notes);
    notes.alignment = { vertical: "middle", wrapText: true };

    row++;
  }
}

// Best-effort one-line rendering of a condition_json blob. The seed
// stores conditions as JSON-encoded predicate trees; we surface them as
// a human-readable predicate so the visitor can see what the rule fires
// on. Falls back to the raw JSON if parsing fails.
function humanizeCondition(json: string): string {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === "object" && parsed !== null) {
      return Object.entries(parsed as Record<string, unknown>)
        .map(([k, v]) => {
          if (Array.isArray(v)) return `${k} ∈ [${v.join(", ")}]`;
          if (typeof v === "object" && v !== null) {
            return Object.entries(v as Record<string, unknown>)
              .map(([op, val]) => `${k} ${opSymbol(op)} ${String(val)}`)
              .join(" AND ");
          }
          return `${k} = ${String(v)}`;
        })
        .join(" AND ");
    }
    return String(parsed);
  } catch {
    return json.slice(0, 80);
  }
}

function opSymbol(op: string): string {
  const map: Record<string, string> = {
    gt: ">",
    gte: "≥",
    lt: "<",
    lte: "≤",
    eq: "=",
    ne: "≠",
    in: "∈",
    nin: "∉",
    contains: "⊃",
  };
  return map[op] ?? op;
}
