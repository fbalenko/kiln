import type { Workbook } from "exceljs";
import type { ArtifactInput } from "../types";
import {
  addTitleRow,
  COLOR,
  FMT_NUM,
  setColumnWidths,
  styleBody,
  styleCalc,
  styleHeader,
  styleLabel,
} from "./styles";
import { MATRIX_FIRST_DATA_ROW } from "./tab-approval-matrix";

// Tab 5 — Approval Routing. Reads the Approval Matrix tab and surfaces
// the required-approver chain for this deal.
//
// The COUNTIFS formulas on this tab depend on the matrix tab's column
// E (Active) — toggling Active TRUE↔FALSE on a rule flips the relevant
// row here. The labels are static (the Approval Agent already produced
// the human-readable rationale), but the count column and the
// expected-cycle band update live.

interface BuildOptions {
  matrixTab: string;
}

export function buildApprovalRoutingTab(
  workbook: Workbook,
  input: ArtifactInput,
  tabName: string,
  opts: BuildOptions,
): void {
  const ws = workbook.addWorksheet(tabName);
  setColumnWidths(ws, [22, 36, 10, 56]);

  let cursor = addTitleRow(
    ws,
    "Approval Routing",
    "Required approver chain for this deal. Counts read from the Approval Matrix tab.",
  );

  // Header row.
  const headers = ["Approver role", "Triggered by rule", "Active?", "Rationale"];
  for (let i = 0; i < headers.length; i++) {
    const c = ws.getCell(cursor, i + 1);
    c.value = headers[i];
    styleHeader(c);
  }
  cursor++;

  const approvers = input.approval.required_approvers;
  if (approvers.length === 0) {
    const empty = ws.getCell(cursor, 1);
    empty.value = "(no required approvers)";
    empty.font = { name: "Calibri", italic: true, size: 10 };
    return;
  }

  // For each approver, render a row. The "Active?" column is a live
  // formula that COUNTIFs the matrix tab — if no row matches the
  // triggered rule with Active=TRUE, this cell shows "INACTIVE".
  for (const approver of approvers) {
    const role = ws.getCell(cursor, 1);
    role.value = humanizeRole(approver.role);
    role.font = { name: "Calibri", size: 11, bold: true };
    styleBody(role);

    const ruleCell = ws.getCell(cursor, 2);
    ruleCell.value = approver.rule_triggered;
    styleBody(ruleCell);
    ruleCell.alignment = { vertical: "middle", wrapText: true };

    // Live cross-tab formula. Match by rule_name on the matrix tab
    // (column A) — when the visitor toggles Active=FALSE on that rule's
    // row in the matrix tab, this cell flips to "INACTIVE".
    const active = ws.getCell(cursor, 3);
    active.value = {
      formula:
        `IF(COUNTIFS('${opts.matrixTab}'!A:A,B${cursor},'${opts.matrixTab}'!E:E,TRUE)>0,"YES","NO")`,
    };
    active.alignment = { horizontal: "center", vertical: "middle" };
    styleCalc(active);

    // Conditional formatting on the active cell.
    ws.addConditionalFormatting({
      ref: `C${cursor}`,
      rules: [
        {
          type: "containsText",
          operator: "containsText",
          priority: 1,
          text: "YES",
          style: {
            fill: { type: "pattern", pattern: "solid", bgColor: { argb: COLOR.goodGreen } },
            font: { color: { argb: COLOR.goodGreenText }, bold: true },
          },
        },
        {
          type: "containsText",
          operator: "containsText",
          priority: 2,
          text: "NO",
          style: {
            fill: { type: "pattern", pattern: "solid", bgColor: { argb: COLOR.badRed } },
            font: { color: { argb: COLOR.badRedText }, bold: true },
          },
        },
      ],
    });

    const rationale = ws.getCell(cursor, 4);
    rationale.value = approver.rationale;
    styleBody(rationale);
    rationale.alignment = { vertical: "middle", wrapText: true };
    ws.getRow(cursor).height = Math.max(20, Math.min(80, approver.rationale.length / 1.6));

    cursor++;
  }

  // Footer block: cycle-time + active-count summary.
  cursor += 1;

  const totalLabel = ws.getCell(cursor, 1);
  totalLabel.value = "Total approvers";
  styleLabel(totalLabel);
  const totalCell = ws.getCell(cursor, 2);
  totalCell.value = approvers.length;
  totalCell.numFmt = FMT_NUM;
  styleBody(totalCell);
  cursor++;

  const activeLabel = ws.getCell(cursor, 1);
  activeLabel.value = "Active rules in matrix";
  styleLabel(activeLabel);
  const activeCount = ws.getCell(cursor, 2);
  activeCount.value = {
    formula: `COUNTIF('${opts.matrixTab}'!E${MATRIX_FIRST_DATA_ROW}:E1000,TRUE)`,
  };
  activeCount.numFmt = FMT_NUM;
  styleCalc(activeCount);
  cursor++;

  const cycleLabel = ws.getCell(cursor, 1);
  cycleLabel.value = "Expected cycle (business days)";
  styleLabel(cycleLabel);
  const cycle = ws.getCell(cursor, 2);
  cycle.value = input.approval.expected_cycle_time_business_days;
  cycle.numFmt = FMT_NUM;
  styleBody(cycle);
  cursor++;

  // One-line summary from the Approval Agent.
  cursor++;
  const summaryLabel = ws.getCell(cursor, 1);
  summaryLabel.value = "Summary";
  styleLabel(summaryLabel);
  const summary = ws.getCell(cursor, 2);
  summary.value = input.approval.one_line_summary;
  summary.font = { name: "Calibri", italic: true, size: 11 };
  ws.mergeCells(cursor, 2, cursor, 4);
  ws.getRow(cursor).alignment = { wrapText: true, vertical: "top" };
  ws.getRow(cursor).height = 36;

  // Blockers list (if any).
  const blockers = input.approval.blockers_to_address_first ?? [];
  if (blockers.length > 0) {
    cursor += 2;
    const blockersHeader = ws.getCell(cursor, 1);
    blockersHeader.value = "BLOCKERS";
    blockersHeader.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLOR.badRedText } };
    cursor++;
    for (let i = 0; i < blockers.length; i++) {
      const idx = ws.getCell(cursor, 1);
      idx.value = i + 1;
      idx.numFmt = FMT_NUM;
      styleBody(idx);
      const text = ws.getCell(cursor, 2);
      text.value = blockers[i];
      ws.mergeCells(cursor, 2, cursor, 4);
      text.alignment = { wrapText: true, vertical: "top" };
      styleBody(text);
      ws.getRow(cursor).height = Math.max(20, Math.min(60, blockers[i].length / 1.6));
      cursor++;
    }
  }
}

function humanizeRole(role: string): string {
  const map: Record<string, string> = {
    ae: "AE",
    ae_manager: "AE Manager",
    rev_ops: "RevOps",
    cfo: "CFO",
    ceo: "CEO",
    cro: "CRO",
    legal: "Legal",
    finance: "Finance",
    rev_rec: "Rev Rec",
  };
  return map[role] ?? role;
}
