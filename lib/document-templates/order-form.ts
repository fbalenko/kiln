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
//   2. Line items table (subscription line + ramp delta + any waivers)
//   3. Ramp schedule visualization — month-by-month bars when applicable
//   4. ASC 606 treatment notes — pulled from asc606.recognized_revenue_schedule
//      + the variable_consideration_flags
//   5. Signature block placeholders (customer + Clay)
//   6. Footer — Kiln disclaimer + review URL

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
  const { deal, pricing, asc606, appUrl } = input;

  const doc = new PDFDocument(PAGE_OPTS);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const closed = new Promise<void>((res) => doc.on("end", () => res()));

  // ---- Header ----
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(COLORS.ink)
    .text("Order Form");
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text(
      `${deal.customer.name} · ${deal.name} · ${input.generatedAt.toISOString().slice(0, 10)}`,
    );
  doc.moveDown(0.6);
  rule(doc);
  doc.moveDown(0.6);

  // ---- Two-column metadata block ----
  const metaTop = doc.y;
  const colWidth =
    (doc.page.width - PAGE_OPTS.margins.left - PAGE_OPTS.margins.right - 24) /
    2;
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
  drawKvGrid(doc, leftMeta, PAGE_OPTS.margins.left, metaTop, colWidth);
  drawKvGrid(
    doc,
    rightMeta,
    PAGE_OPTS.margins.left + colWidth + 24,
    metaTop,
    colWidth,
  );
  doc.y = metaTop + leftMeta.length * KV_ROW_HEIGHT + 8;

  // ---- Line items table ----
  rule(doc);
  doc.moveDown(0.4);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.ink)
    .text("Line items");
  doc.moveDown(0.3);
  drawLineItems(doc, input);
  doc.moveDown(0.5);

  // ---- Ramp schedule (if deal has ramp_schedule_json) ----
  const ramp = parseRampSchedule(deal.ramp_schedule_json);
  if (ramp.length > 0) {
    rule(doc);
    doc.moveDown(0.4);
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLORS.ink)
      .text("Ramp schedule");
    doc.moveDown(0.3);
    drawRampBars(doc, ramp);
    doc.moveDown(0.5);
  }

  // ---- ASC 606 notes ----
  rule(doc);
  doc.moveDown(0.4);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.ink)
    .text("ASC 606 treatment notes");
  doc.moveDown(0.3);
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(COLORS.ink)
    .list(
      [
        ...asc606.variable_consideration_flags
          .slice(0, 4)
          .map(
            (f) =>
              `${f.source} (${f.estimation_difficulty} difficulty): ${f.treatment_required}`,
          ),
        asc606.contract_modification_risk.is_at_risk
          ? `Contract modification risk: ${asc606.contract_modification_risk.explanation}`
          : "Contract modification risk: not flagged.",
        `Confidence: ${asc606.confidence}.`,
      ],
      { bulletRadius: 1.5, textIndent: 8 },
    );
  doc.moveDown(0.6);

  // ---- Signature block ----
  rule(doc);
  doc.moveDown(0.4);
  drawSignatureBlock(doc, deal);

  // ---- Footer ----
  drawFooter(doc, input);
  void pricing; // referenced for typing; line items consume it implicitly above

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

const KV_ROW_HEIGHT = 32;

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
      .fontSize(10.5)
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
  const cols = [
    { label: "Item", width: 200, align: "left" as const },
    { label: "Qty", width: 50, align: "right" as const },
    { label: "Unit Price", width: 90, align: "right" as const },
    { label: "Subtotal", width: 90, align: "right" as const },
    { label: "Notes", width: 70, align: "left" as const },
  ];
  const totalW = cols.reduce((s, c) => s + c.width, 0);
  const startX = PAGE_OPTS.margins.left;
  const usableW =
    doc.page.width - PAGE_OPTS.margins.left - PAGE_OPTS.margins.right;
  const scale = usableW / totalW;

  // Header row
  let cx = startX;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.muted);
  for (const col of cols) {
    doc.text(col.label.toUpperCase(), cx, doc.y, {
      width: col.width * scale,
      align: col.align,
      characterSpacing: 1,
    });
    cx += col.width * scale;
  }
  doc.moveDown(0.6);

  const rows: [string, string, string, string, string][] = [
    [
      "Annual subscription",
      "1",
      formatMoney(deal.list_price),
      formatMoney(deal.list_price),
      "",
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
    cx = startX;
    const rowY = doc.y;
    let maxH = 0;
    cols.forEach((col, i) => {
      doc.text(row[i], cx, rowY, {
        width: col.width * scale - 6,
        align: col.align,
      });
      const h = doc.heightOfString(row[i], {
        width: col.width * scale - 6,
        align: col.align,
      });
      if (h > maxH) maxH = h;
      cx += col.width * scale;
    });
    doc.y = rowY + maxH + 4;
  }

  // Total row — single line, label left of value, no overlap.
  doc.moveDown(0.2);
  rule(doc);
  doc.moveDown(0.3);
  const totalLabelX =
    startX + (cols[0].width + cols[1].width) * scale;
  const totalValueX =
    startX + (cols[0].width + cols[1].width + cols[2].width) * scale;
  const totalY = doc.y;
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.ink)
    .text("TCV", totalLabelX, totalY, {
      width: cols[2].width * scale - 6,
      align: "right",
    });
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.brand)
    .text(formatMoney(deal.tcv), totalValueX, totalY, {
      width: cols[3].width * scale - 6,
      align: "right",
    });
  doc.y = totalY + 16;
}

function drawRampBars(
  doc: typeof PDFDocument.prototype,
  ramp: { month: number; price_pct: number }[],
) {
  const startX = PAGE_OPTS.margins.left;
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
    const x = startX + i * slot;
    const w = slot - padding;

    // Background box
    doc
      .rect(x, baseY, w, barHeight)
      .fill(COLORS.brandTint);
    // Fill bar (height proportional to price_pct)
    doc
      .rect(x, baseY + (1 - pct) * barHeight, w, pct * barHeight)
      .fill(COLORS.brand);

    // Month label below
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(COLORS.muted)
      .text(`M${r.month}`, x, baseY + barHeight + 2, {
        width: w,
        align: "center",
      });
  }
  doc.y = baseY + barHeight + 18;
}

function drawSignatureBlock(
  doc: typeof PDFDocument.prototype,
  deal: ArtifactInput["deal"],
) {
  const startX = PAGE_OPTS.margins.left;
  const usableW =
    doc.page.width - PAGE_OPTS.margins.left - PAGE_OPTS.margins.right;
  const colW = (usableW - 24) / 2;
  const y = doc.y + 6;

  drawSignatureColumn(doc, startX, y, colW, "Customer signatory", deal.customer.name);
  drawSignatureColumn(
    doc,
    startX + colW + 24,
    y,
    colW,
    "Clay signatory",
    "Clay, Inc.",
  );
  doc.y = y + 80;
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
    .text(heading.toUpperCase(), x, y, { width, characterSpacing: 1.2 });
  doc.font("Helvetica").fontSize(10).fillColor(COLORS.ink).text(org, x, y + 12);
  // Signature line
  doc
    .strokeColor(COLORS.border)
    .lineWidth(0.5)
    .moveTo(x, y + 50)
    .lineTo(x + width, y + 50)
    .stroke();
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text("Signature · Name · Title · Date", x, y + 54, { width });
}

function drawFooter(
  doc: typeof PDFDocument.prototype,
  input: ArtifactInput,
) {
  const footerY = doc.page.height - PAGE_OPTS.margins.bottom + 16;
  const usableW =
    doc.page.width - PAGE_OPTS.margins.left - PAGE_OPTS.margins.right;
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(COLORS.muted)
    .text(KILN_DISCLAIMER, PAGE_OPTS.margins.left, footerY - 18, {
      width: usableW,
    });
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(COLORS.muted)
    .text(
      `Generated by Kiln · ${input.appUrl}/deals/${input.deal.id}`,
      PAGE_OPTS.margins.left,
      footerY,
      { width: usableW },
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

// ramp_schedule_json is `[{month, amount}]` per the seed. Normalize to a
// price_pct in [0, 1] by dividing each month's amount by the max amount in
// the schedule (so the bar chart shows ramp shape, not absolute dollars).
// Also accepts {price_pct} or {multiplier} for forward-compat.
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
      const raw =
        typeof obj.amount === "number"
          ? obj.amount
          : typeof obj.price_pct === "number"
            ? obj.price_pct
            : typeof obj.multiplier === "number"
              ? obj.multiplier
              : null;
      if (!Number.isFinite(month) || raw === null || !Number.isFinite(raw)) {
        continue;
      }
      interim.push({ month, raw: raw as number });
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

// Display the deal's discount field as a percent. Schema stores it as a
// percentage value (15 means 15%), not a decimal.
function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
