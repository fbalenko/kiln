import ExcelJS from "exceljs";
import {
  artifactFilename,
  type ArtifactBuffer,
  type ArtifactInput,
} from "../types";
import { buildDealSummaryTab } from "./tab-deal-summary";
import { buildPricingModelTab } from "./tab-pricing-model";
import { buildAsc606ScheduleTab } from "./tab-asc606-schedule";
import { buildAlternativesTab } from "./tab-alternatives";
import { buildApprovalRoutingTab } from "./tab-approval-routing";
import { buildApprovalMatrixTab } from "./tab-approval-matrix";
import { buildPricingGuardrailsTab } from "./tab-pricing-guardrails";
import { buildSimilarDealsTab } from "./tab-similar-deals";
import { buildCompAnalysisTab } from "./tab-comp-analysis";
import { buildAuditLogTab } from "./tab-audit-log";

// Tab name registry. Cross-tab formulas reference tabs by these names —
// keep in sync with the names each builder assigns to its worksheet.
//
// Excel cross-sheet refs use single-quoted names when the name contains
// spaces: `'Pricing Model'!B4`. Every name here is space-bearing on purpose
// so that pattern is consistent and human-readable inside the workbook.
export const TAB_NAMES = {
  dealSummary: "Deal Summary",
  pricingModel: "Pricing Model",
  asc606Schedule: "ASC 606 Schedule",
  alternatives: "Alternatives",
  approvalRouting: "Approval Routing",
  approvalMatrix: "Approval Matrix",
  pricingGuardrails: "Pricing Guardrails",
  similarDeals: "Similar Deals",
  compAnalysis: "Comp Analysis",
  auditLog: "Audit Log",
} as const;

// Generate the 10-tab .xlsx financial-model artifact for a given review.
// Per docs/10-sheets-integration.md — this is the JD-signal artifact for
// Excel/Sheets/financial-modeling/ASC-606 fluency. The visitor opens the
// file and edits Tab 2's discount cell; Tab 3's recognition schedule
// recalculates because the formulas are real cross-tab references.
export async function generateFinancialModel(
  input: ArtifactInput,
): Promise<ArtifactBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Kiln";
  workbook.lastModifiedBy = "Kiln";
  workbook.created = input.generatedAt;
  workbook.modified = input.generatedAt;
  workbook.title = `${input.deal.customer.name} — ${input.deal.name} (financial model)`;
  workbook.company = "Kiln Demo Workspace";

  // Build order matters slightly: the formula-bearing tabs (Pricing Model,
  // ASC 606 Schedule, Approval Matrix) need to exist before the tabs that
  // reference them via cross-sheet formulas — exceljs accepts forward
  // references but tab order in the UI is tab-creation order, so build
  // tabs in the visitor-friendly read order from the spec.
  buildDealSummaryTab(workbook, input, TAB_NAMES.dealSummary);
  buildPricingModelTab(workbook, input, TAB_NAMES.pricingModel);
  buildAsc606ScheduleTab(workbook, input, TAB_NAMES.asc606Schedule, {
    pricingModelTab: TAB_NAMES.pricingModel,
  });
  buildAlternativesTab(workbook, input, TAB_NAMES.alternatives);
  buildApprovalRoutingTab(workbook, input, TAB_NAMES.approvalRouting, {
    matrixTab: TAB_NAMES.approvalMatrix,
  });
  buildApprovalMatrixTab(workbook, input, TAB_NAMES.approvalMatrix);
  buildPricingGuardrailsTab(workbook, input, TAB_NAMES.pricingGuardrails);
  buildSimilarDealsTab(workbook, input, TAB_NAMES.similarDeals);
  buildCompAnalysisTab(workbook, input, TAB_NAMES.compAnalysis);
  buildAuditLogTab(workbook, input, TAB_NAMES.auditLog);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer as ArrayBuffer);
  return {
    buffer,
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: artifactFilename(input, "financial-model"),
    byteLength: buffer.byteLength,
  };
}
