import type { Workbook } from "exceljs";
import type { ArtifactInput } from "../types";
import {
  addTitleRow,
  COLOR,
  FMT_NUM,
  FMT_PCT,
  setColumnWidths,
  styleBody,
  styleHeader,
  styleMono,
} from "./styles";
import type { PricingOutput } from "@/lib/agents/schemas";

// Tab 7 — Pricing Guardrails. Read-only table of guardrails with PASS/FAIL
// status. Status cell uses conditional formatting (green PASS, red FAIL).
// The guardrails come from the Pricing Agent's evaluated output for this
// specific deal — already-computed pass/fail per rule.

type Eval = PricingOutput["guardrail_evaluations"][number];

export function buildPricingGuardrailsTab(
  workbook: Workbook,
  input: ArtifactInput,
  tabName: string,
): void {
  const ws = workbook.addWorksheet(tabName);
  setColumnWidths(ws, [38, 16, 16, 12, 22, 50]);

  let row = addTitleRow(
    ws,
    "Pricing Guardrails",
    "Pass/fail evaluation of guardrails against the proposed deal terms.",
  );

  const headers = ["Guardrail", "Threshold", "Actual", "Status", "Severity", "Explanation"];
  for (let i = 0; i < headers.length; i++) {
    const c = ws.getCell(row, i + 1);
    c.value = headers[i];
    styleHeader(c);
  }
  row++;

  const evals = input.pricing.guardrail_evaluations;
  if (evals.length === 0) {
    const empty = ws.getCell(row, 1);
    empty.value = "(no guardrail evaluations on this deal)";
    empty.font = { name: "Calibri", italic: true, size: 10 };
    return;
  }

  for (const ev of evals) {
    const isPercentMetric = isPercentLike(ev);

    const ruleName = ws.getCell(row, 1);
    ruleName.value = ev.rule_name;
    styleBody(ruleName);

    const threshold = ws.getCell(row, 2);
    threshold.value = isPercentMetric ? ev.threshold_value / 100 : ev.threshold_value;
    threshold.numFmt = isPercentMetric ? FMT_PCT : FMT_NUM;
    styleMono(threshold);

    const actual = ws.getCell(row, 3);
    actual.value = isPercentMetric ? ev.actual_value / 100 : ev.actual_value;
    actual.numFmt = isPercentMetric ? FMT_PCT : FMT_NUM;
    styleMono(actual);

    const status = ws.getCell(row, 4);
    status.value = ev.passed ? "PASS" : "FAIL";
    status.alignment = { horizontal: "center", vertical: "middle" };
    status.font = {
      name: "Calibri",
      size: 11,
      bold: true,
      color: { argb: ev.passed ? COLOR.goodGreenText : COLOR.badRedText },
    };
    status.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: ev.passed ? COLOR.goodGreen : COLOR.badRed },
    };
    status.border = {
      top: { style: "thin", color: { argb: COLOR.border } },
      left: { style: "thin", color: { argb: COLOR.border } },
      bottom: { style: "thin", color: { argb: COLOR.border } },
      right: { style: "thin", color: { argb: COLOR.border } },
    };

    const severity = ws.getCell(row, 5);
    severity.value = humanizeSeverity(ev.severity);
    styleBody(severity);

    const explanation = ws.getCell(row, 6);
    explanation.value = ev.explanation;
    styleBody(explanation);
    explanation.alignment = { vertical: "middle", wrapText: true };
    ws.getRow(row).height = Math.max(20, Math.min(80, ev.explanation.length / 1.6));

    row++;
  }

  // Conditional formatting could replace the inline coloring above, but
  // exceljs's `addConditionalFormatting` is a more brittle path than
  // setting fills directly per-row. The visual outcome is identical and
  // these cells are static (no recalc dependency), so direct fills are
  // the right call here.
}

function isPercentLike(ev: Eval): boolean {
  // Heuristic: rule name mentioning discount/margin or thresholds <= 1
  // (the convention the agent uses for percentage thresholds) → render
  // as a percentage. Otherwise plain number.
  const name = ev.rule_name.toLowerCase();
  if (name.includes("discount") || name.includes("margin") || name.includes("rate")) {
    return true;
  }
  return false;
}

function humanizeSeverity(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
