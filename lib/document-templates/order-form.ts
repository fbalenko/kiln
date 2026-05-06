import PDFDocument from "pdfkit";
import {
  artifactFilename,
  KILN_DISCLAIMER,
  type ArtifactInput,
  type ArtifactBuffer,
} from "./types";

// Populated order form PDF. Single page (US Letter, 1" margins).
//
// Sections:
//   1. Header — customer + deal name + ACV/TCV/term
//   2. Two-column metadata grid
//   3. Line items table (subscription + ramp delta + waivers)
//   4. Ramp schedule visualization — month-by-month bars
//   5. ASC 606 treatment notes
//   6. Signature block (customer + Clay)
//   7. Footer — Kiln disclaimer + review URL
//
// Implementation note: pdfkit's text() with explicit (x, y) sets the current
// x as a column anchor, which then bleeds into subsequent autoflow calls
// (text after drawKvGrid would otherwise render in the right column). Every
// helper explicitly resets doc.x = LEFT after drawing.

const PAGE_OPTS = {
  size: "LETTER",
  margins: { top: 56, bottom: 56, left: 56, right: 56 },
} as const;

const COLORS = {
  brand: "#3B82F6",
  ink: "#0A0A0A",
  muted: "#737373",
  border: "#E5E5E5",
  brandTint: "#EFF6FF",
};

export async function generateOrderForm(
  input: ArtifactInput,
): Promise<ArtifactBuffer> {
  const { deal, asc606, pricing } = input;
  void pricing; // referenced inside drawLineItems

  const doc = new PDFDocument(PAGE_OPTS);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const closed = new Promise<void>((res) => doc.on("end", () => res()));

  const left = PAGE_OPTS.margins.left;
  const usableW =
    doc.page.width - PAGE_OPTS.margins.left - PAGE_OPTS.margins.right;

  // ---- Header ----
  doc.x = left;
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(COLORS.ink)
    .text("Order Form", left, doc.y, { width: usableW });
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(COLORS.muted)
    .text(
      `${deal.customer.name} · ${deal.name} · ${input.generatedAt.toISOString().slice(0, 10)}`,
      left,
      doc.y,
      { width: usableW },
    );
  doc.moveDown(0.6);
  rule(doc);
  doc.moveDown(0.6);

  // ---- Two-column metadata block ----
  const metaTop = doc.y;
  const colWidth = (usableW - 24) / 2;
  const leftMeta: [string, string][] = [
    ["Customer", deal.customer.name],
    ["Segment", humanize(deal.customer.segment)],
    ["Industry", deal.customer.industry],
    ["AE Owner", deal.ae_owner],
  ];
  const rightMeta: [string, string][] = [
    ["ACV", formatMoney(deal.acv)],
    ["TCV", formatMoney(deal.tcv)],
    ["Term", `${deal.term_months} months`],
    ["Pricing model", humanize(deal.pricing_model)],
  ];
  drawKvGrid(doc, leftMeta, left, metaTop, colWidth);
  drawKvGrid(doc, rightMeta, left + colWidth + 24, metaTop, colWidth);
  doc.x = left;
  doc.y = metaTop + leftMeta.length * KV_ROW_HEIGHT + 4;

  // ---- Line items table ----
  rule(doc);
  doc.moveDown(0.4);
  doc.x = left;
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.ink)
    .text("LINE ITEMS", left, doc.y, {
      width: usableW,
      characterSpacing: 1.2,
    });
  doc.moveDown(0.4);
  drawLineItems(doc, input);
  doc.x = left;
  doc.moveDown(0.4);

  // ---- Ramp schedule (optional) ----
  const ramp = parseRampSchedule(deal.ramp_schedule_json);
  if (ramp.length > 0) {
    rule(doc);
    doc.moveDown(0.4);
    doc.x = left;
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLORS.ink)
      .text("RAMP SCHEDULE", left, doc.y, {
        width: usableW,
        characterSpacing: 1.2,
      });
    doc.moveDown(0.4);
    drawRampBars(doc, ramp);
    doc.x = left;
    doc.moveDown(0.4);
  }

  // ---- ASC 606 notes ----
  rule(doc);
  doc.moveDown(0.4);
  doc.x = left;
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.ink)
    .text("ASC 606 TREATMENT NOTES", left, doc.y, {
      width: usableW,
      characterSpacing: 1.2,
    });
  doc.moveDown(0.3);

  const notes = [
    ...asc606.variable_consideration_flags
      .slice(0, 4)
      .map(
        (f) =>
          `${humanize(f.source)} (${f.estimation_difficulty} difficulty): ${f.treatment_required.replace(/_/g, " ")}`,
      ),
    asc606.contract_modification_risk.is_at_risk
      ? `Contract modification risk: ${asc606.contract_modification_risk.explanation}`
      : "Contract modification risk: not flagged.",
    `Confidence: ${asc606.confidence}.`,
  ];
  drawBullets(doc, notes, left, usableW);
  doc.x = left;
  doc.moveDown(0.4);

  // ---- Signature block ----
  rule(doc);
  doc.moveDown(0.4);
  drawSignatureBlock(doc, deal);

  // ---- Footer ----
  drawFooter(doc, input);

  doc.end();
  await closed;

  const buffer = Buffer.concat(chunks);
  return {
    buffer,
    contentType: "application/pdf",
    filename: artifactFilename(input, "order-form"),
    byteLength: buffer.byteLength,
  };
}

// ---------------------------------------------------------------------------

const KV_ROW_HEIGHT = 30;

function drawKvGrid(
  doc: typeof PDFDocument.prototype,
  rows: [string, string][],
  x: number,
  y: number,
  width: number,
) {
  let cy = y;
  for (const [k, v] of rows) {
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(COLORS.muted)
      .text(k.toUpperCase(), x, cy, { width, characterSpacing: 1.2 });
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(COLORS.ink)
      .text(v, x, cy + 11, { width });
    cy += KV_ROW_HEIGHT;
  }
}

function drawLineItems(
  doc: typeof PDFDocument.prototype,
  input: ArtifactInput,
) {
  const { deal, pricing } = input;
  const left = PAGE_OPTS.margins.left;
  const usableW =
    doc.page.width - PAGE_OPTS.margins.left - PAGE_OPTS.margins.right;

  // Column proportions sum to usableW.
  const cols: { label: string; width: number; align: "left" | "right" }[] = [
    { label: "Item", width: usableW * 0.42, align: "left" },
    { label: "Qty", width: usableW * 0.08, align: "right" },
    { label: "Unit Price", width: usableW * 0.16, align: "right" },
    { label: "Subtotal", width: usableW * 0.16, align: "right" },
    { label: "Notes", width: usableW * 0.18, align: "left" },
  ];
  const padX = 4;

  // Header row — fixed Y for all columns.
  const headerY = doc.y;
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(COLORS.muted);
  let cx = left;
  for (const col of cols) {
    doc.text(col.label.toUpperCase(), cx + padX, headerY, {
      width: col.width - padX * 2,
      align: col.align,
      characterSpacing: 1.0,
      lineBreak: false,
    });
    cx += col.width;
  }
  doc.y = headerY + 14;

  doc
    .strokeColor(COLORS.border)
    .lineWidth(0.5)
    .moveTo(left, doc.y)
    .lineTo(left + usableW, doc.y)
    .stroke();
  doc.y += 4;

  // Body rows
  const rows: [string, string, string, string, string][] = [
    [
      "Annual subscription",
      "1",
      formatMoney(deal.list_price),
      formatMoney(deal.list_price),
      "List rate",
    ],
    [
      "Discount",
      "1",
      `-${formatPercent(deal.discount_pct)}`,
      `-${formatMoney(deal.list_price - pricing.proposed_price)}`,
      "Negotiated",
    ],
    [
      `Multi-year (term ${deal.term_months}mo)`,
      String(Math.round(deal.term_months / 12)),
      formatMoney(pricing.proposed_price),
      formatMoney(deal.tcv),
      "Locked",
    ],
  ];

  doc.font("Helvetica").fontSize(10).fillColor(COLORS.ink);
  for (const row of rows) {
    const rowY = doc.y;
    cx = left;
    let maxH = 0;
    cols.forEach((col, i) => {
      doc.text(row[i] ?? "", cx + padX, rowY, {
        width: col.width - padX * 2,
        align: col.align,
        lineBreak: true,
      });
      const h = doc.heightOfString(row[i] ?? "", {
        width: col.width - padX * 2,
        align: col.align,
      });
      if (h > maxH) maxH = h;
      cx += col.width;
    });
    doc.y = rowY + Math.max(maxH, 12) + 4;
  }

  // TCV total row
  doc
    .strokeColor(COLORS.border)
    .lineWidth(0.5)
    .moveTo(left, doc.y)
    .lineTo(left + usableW, doc.y)
    .stroke();
  doc.y += 4;

  const totalY = doc.y;
  // Sum the widths of cols 0+1+2 to left-align "TCV" label, then col 3 has the value.
  const labelStartX = left + cols[0].width + cols[1].width;
  const labelW = cols[2].width;
  const valueStartX = labelStartX + cols[2].width;
  const valueW = cols[3].width;

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.ink)
    .text("TCV", labelStartX + padX, totalY, {
      width: labelW - padX * 2,
      align: "right",
      lineBreak: false,
    });
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.brand)
    .text(formatMoney(deal.tcv), valueStartX + padX, totalY, {
      width: valueW - padX * 2,
      align: "right",
      lineBreak: false,
    });
  doc.y = totalY + 18;
}

function drawBullets(
  doc: typeof PDFDocument.prototype,
  items: string[],
  x: number,
  width: number,
) {
  for (const item of items) {
    const y = doc.y;
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(COLORS.ink)
      .text("•", x, y, { width: 12, lineBreak: false });
    doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.ink).text(
      item,
      x + 14,
      y,
      { width: width - 14, lineGap: 1.5 },
    );
    doc.moveDown(0.15);
  }
}

function drawRampBars(
  doc: typeof PDFDocument.prototype,
  ramp: { month: number; price_pct: number }[],
) {
  const left = PAGE_OPTS.margins.left;
  const usableW =
    doc.page.width - PAGE_OPTS.margins.left - PAGE_OPTS.margins.right;
  const baseY = doc.y;
  const barHeight = 22;
  const months = Math.min(ramp.length, 12);
  const slot = usableW / months;
  const padding = 3;

  for (let i = 0; i < months; i++) {
    const r = ramp[i];
    const pct = Math.max(0.05, Math.min(1, r.price_pct));
    const x = left + i * slot;
    const w = slot - padding;
    doc.rect(x, baseY, w, barHeight).fill(COLORS.brandTint);
    doc
      .rect(x, baseY + (1 - pct) * barHeight, w, pct * barHeight)
      .fill(COLORS.brand);
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(COLORS.muted)
      .text(`M${r.month}`, x, baseY + barHeight + 2, {
        width: w,
        align: "center",
        lineBreak: false,
      });
  }
  doc.y = baseY + barHeight + 16;
}

function drawSignatureBlock(
  doc: typeof PDFDocument.prototype,
  deal: ArtifactInput["deal"],
) {
  const left = PAGE_OPTS.margins.left;
  const usableW =
    doc.page.width - PAGE_OPTS.margins.left - PAGE_OPTS.margins.right;
  const colW = (usableW - 24) / 2;
  const y = doc.y + 4;

  drawSignatureColumn(doc, left, y, colW, "Customer signatory", deal.customer.name);
  drawSignatureColumn(doc, left + colW + 24, y, colW, "Clay signatory", "Clay, Inc.");
  doc.x = left;
  doc.y = y + 70;
}

function drawSignatureColumn(
  doc: typeof PDFDocument.prototype,
  x: number,
  y: number,
  width: number,
  heading: string,
  org: string,
) {
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(heading.toUpperCase(), x, y, {
      width,
      characterSpacing: 1.2,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.ink)
    .text(org, x, y + 12, { width, lineBreak: false });
  doc
    .strokeColor(COLORS.border)
    .lineWidth(0.5)
    .moveTo(x, y + 46)
    .lineTo(x + width, y + 46)
    .stroke();
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text("Signature · Name · Title · Date", x, y + 50, {
      width,
      lineBreak: false,
    });
}

function drawFooter(
  doc: typeof PDFDocument.prototype,
  input: ArtifactInput,
) {
  const left = PAGE_OPTS.margins.left;
  const usableW =
    doc.page.width - PAGE_OPTS.margins.left - PAGE_OPTS.margins.right;
  // Anchor far enough above the page bottom that the 2-line footer (~24px)
  // stays inside the printable area. Past this and pdfkit auto-paginates.
  const baseY = doc.page.height - PAGE_OPTS.margins.bottom - 32;

  doc
    .strokeColor(COLORS.border)
    .lineWidth(0.5)
    .moveTo(left, baseY - 6)
    .lineTo(left + usableW, baseY - 6)
    .stroke();
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(COLORS.muted)
    .text(KILN_DISCLAIMER, left, baseY, {
      width: usableW,
      align: "left",
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(COLORS.muted)
    .text(
      `Generated by Kiln · ${input.appUrl}/deals/${input.deal.id}`,
      left,
      baseY + 12,
      { width: usableW, align: "left", lineBreak: false },
    );
}

function rule(doc: typeof PDFDocument.prototype) {
  const left = PAGE_OPTS.margins.left;
  const right = doc.page.width - PAGE_OPTS.margins.right;
  doc
    .strokeColor(COLORS.border)
    .lineWidth(0.5)
    .moveTo(left, doc.y)
    .lineTo(right, doc.y)
    .stroke();
}

// ramp_schedule_json is `[{month, amount}]` per the seed. Normalize amounts
// to a price_pct ∈ (0, 1] by dividing each month's amount by the schedule's
// max amount, so the bar shows ramp shape instead of absolute dollars.
function parseRampSchedule(
  raw: string | null,
): { month: number; price_pct: number }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const interim: { month: number; raw: number }[] = [];
    for (const r of parsed) {
      if (!r || typeof r !== "object") continue;
      const obj = r as Record<string, unknown>;
      const month =
        typeof obj.month === "number" ? obj.month : Number(obj.month);
      const value =
        typeof obj.amount === "number"
          ? obj.amount
          : typeof obj.price_pct === "number"
            ? obj.price_pct
            : typeof obj.multiplier === "number"
              ? obj.multiplier
              : null;
      if (!Number.isFinite(month) || value === null || !Number.isFinite(value)) {
        continue;
      }
      interim.push({ month, raw: value });
    }
    if (interim.length === 0) return [];
    const max = interim.reduce((m, e) => (e.raw > m ? e.raw : m), 0);
    const denom = max > 0 ? max : 1;
    return interim
      .sort((a, b) => a.month - b.month)
      .map((e) => ({ month: e.month, price_pct: e.raw / denom }));
  } catch {
    return [];
  }
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
