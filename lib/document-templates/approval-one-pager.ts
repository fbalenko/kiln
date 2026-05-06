import PDFDocument from "pdfkit";
import {
  artifactFilename,
  KILN_DISCLAIMER,
  type ArtifactInput,
  type ArtifactBuffer,
} from "./types";

// Single-page PDF for the deal-desk review meeting. Uses pdfkit's default
// Helvetica family (no font registration needed — keeps the bundle small and
// avoids file-system font-load surprises in serverless).
//
// The Comms agent emits each section's content as compact markdown, often
// including pipe-tables and bold runs. The renderer parses that markdown into
// a small block model (paragraph / table / bullet-list) and draws each block
// natively in pdfkit so the output reads like a designed deal-desk one-pager,
// not a markdown dump.

const PAGE_OPTS = {
  size: "LETTER",
  margins: { top: 56, bottom: 56, left: 56, right: 56 },
} as const;

const COLORS = {
  brand: "#3B82F6", // Clay blue
  ink: "#0A0A0A",
  muted: "#737373",
  border: "#E5E5E5",
  brandTint: "#EFF6FF",
};

const FOOTER_RESERVE = 56; // px above bottom margin reserved for disclaimer + footer line.

export async function generateApprovalOnePager(
  input: ArtifactInput,
): Promise<ArtifactBuffer> {
  const { deal, comms, approval, appUrl } = input;
  const onePager = comms.approval_review_one_pager;

  const doc = new PDFDocument({ ...PAGE_OPTS, autoFirstPage: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const closed = new Promise<void>((res) => doc.on("end", () => res()));

  const left = PAGE_OPTS.margins.left;
  const usableWidth =
    doc.page.width - PAGE_OPTS.margins.left - PAGE_OPTS.margins.right;
  const contentBottom = doc.page.height - PAGE_OPTS.margins.bottom - FOOTER_RESERVE;

  // ---- Header band ----
  doc.x = left;
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(deal.customer.name.toUpperCase(), left, doc.y, {
      width: usableWidth,
      characterSpacing: 1.5,
    });
  doc.moveDown(0.2);
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(COLORS.ink)
    .text(onePager.title || deal.name, left, doc.y, { width: usableWidth });
  doc.moveDown(0.2);
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(COLORS.muted)
    .text(metadataLine(input), left, doc.y, { width: usableWidth });
  doc.moveDown(0.5);
  rule(doc);
  doc.moveDown(0.5);

  // ---- Sections ----
  // Pre-measure every section so we can pack greedily: render in original
  // order, but skip a section that won't fit while still trying the next
  // one. That way the short "Recommendation" closer makes the page even
  // when the long "Risk Findings" block doesn't.
  const measured = onePager.sections.map((s) => {
    const blocks = parseMarkdown(s.content_markdown);
    const height =
      14 /* heading line */ +
      estimateBlocksHeight(doc, blocks, usableWidth) +
      8; /* trailing gap */
    return { heading: s.heading, blocks, height };
  });

  const skipped: string[] = [];
  for (const sec of measured) {
    const remaining = contentBottom - doc.y;
    if (sec.height > remaining) {
      skipped.push(sec.heading);
      continue;
    }

    doc.x = left;
    doc
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor(COLORS.brand)
      .text(sec.heading.toUpperCase(), left, doc.y, {
        width: usableWidth,
        characterSpacing: 1.4,
      });
    doc.moveDown(0.25);

    renderBlocks(doc, sec.blocks, left, usableWidth, contentBottom);
    doc.moveDown(0.25);
  }

  if (skipped.length > 0 && doc.y < contentBottom - 12) {
    doc.x = left;
    doc
      .font("Helvetica-Oblique")
      .fontSize(8.5)
      .fillColor(COLORS.muted)
      .text(
        `(${skipped.join(" · ")} omitted for length — see the full review on the deal page)`,
        left,
        doc.y,
        { width: usableWidth },
      );
  }

  // ---- Footer band, anchored to bottom of page ----
  drawFooter(doc, input, approval);

  doc.end();
  await closed;

  const buffer = Buffer.concat(chunks);
  return {
    buffer,
    contentType: "application/pdf",
    filename: artifactFilename(input, "approval-one-pager"),
    byteLength: buffer.byteLength,
  };
}

// ---------------------------------------------------------------------------
// Markdown block model

type Block =
  | { kind: "para"; runs: TextRun[] }
  | { kind: "bullet"; runs: TextRun[] }
  | { kind: "ordered"; index: number; runs: TextRun[] }
  | { kind: "table"; headers: string[]; rows: string[][] };

interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

// Parse the agent's compact markdown into a block list. Recognized syntax:
//   - **bold** / *italic* / `code`
//   - bullets:  "- foo" / "* foo" / "• foo"
//   - ordered:  "1. foo"
//   - table:    "| a | b |" lines (separator row "|---|---|" is detected & skipped)
function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }

    // Table — header row, separator row, then any consecutive pipe rows.
    if (
      trimmed.startsWith("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const headers = splitPipes(trimmed);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitPipes(lines[i].trim()));
        i++;
      }
      blocks.push({ kind: "table", headers, rows });
      continue;
    }

    // Bullet
    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      blocks.push({ kind: "bullet", runs: parseInline(bulletMatch[1]) });
      i++;
      // Continuation lines that are indented but not a new bullet/heading
      while (
        i < lines.length &&
        lines[i].startsWith("   ") &&
        !lines[i].trim().match(/^[-*•]\s+/) &&
        !lines[i].trim().match(/^\d+\.\s+/) &&
        lines[i].trim()
      ) {
        const last = blocks[blocks.length - 1];
        if (last.kind === "bullet") {
          last.runs.push({ text: " " });
          last.runs.push(...parseInline(lines[i].trim()));
        }
        i++;
      }
      continue;
    }

    // Ordered list
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      blocks.push({
        kind: "ordered",
        index: Number(orderedMatch[1]),
        runs: parseInline(orderedMatch[2]),
      });
      i++;
      while (
        i < lines.length &&
        lines[i].startsWith("   ") &&
        !lines[i].trim().match(/^[-*•]\s+/) &&
        !lines[i].trim().match(/^\d+\.\s+/) &&
        lines[i].trim()
      ) {
        const last = blocks[blocks.length - 1];
        if (last.kind === "ordered") {
          last.runs.push({ text: " " });
          last.runs.push(...parseInline(lines[i].trim()));
        }
        i++;
      }
      continue;
    }

    // Paragraph — accumulate consecutive non-blank, non-list, non-table lines
    const paraLines: string[] = [trimmed];
    i++;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next) break;
      if (next.startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) break;
      if (/^[-*•]\s+/.test(next)) break;
      if (/^\d+\.\s+/.test(next)) break;
      paraLines.push(next);
      i++;
    }
    blocks.push({ kind: "para", runs: parseInline(paraLines.join(" ")) });
  }
  return blocks;
}

function isTableSeparator(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith("|")) return false;
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(t);
}

function splitPipes(line: string): string[] {
  // Strip leading/trailing pipes and split on internal pipes (not escaped).
  const inner = line.replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((s) => s.trim());
}

// Inline tokenizer: handles **bold**, *italic*/_italic_, `code`, [text](url).
// Returns a flat list of TextRuns. Unknown markdown passes through as text.
function parseInline(src: string): TextRun[] {
  const runs: TextRun[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(_([^_]+)_)|(`([^`]+)`)|(\[([^\]]+)\]\([^)]+\))/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    if (match.index > lastIdx) {
      runs.push({ text: src.slice(lastIdx, match.index) });
    }
    if (match[2]) runs.push({ text: match[2], bold: true });
    else if (match[4]) runs.push({ text: match[4], italic: true });
    else if (match[6]) runs.push({ text: match[6], italic: true });
    else if (match[8]) runs.push({ text: match[8] }); // code → plain
    else if (match[10]) runs.push({ text: match[10] }); // link → label only
    lastIdx = re.lastIndex;
  }
  if (lastIdx < src.length) runs.push({ text: src.slice(lastIdx) });
  return runs;
}

// ---------------------------------------------------------------------------
// Block rendering

function renderBlocks(
  doc: typeof PDFDocument.prototype,
  blocks: Block[],
  left: number,
  width: number,
  bottomLimit: number,
): void {
  for (const block of blocks) {
    if (doc.y > bottomLimit) return;
    switch (block.kind) {
      case "para":
        renderRuns(doc, block.runs, left, width, 9.5, 0);
        doc.moveDown(0.25);
        break;
      case "bullet":
        renderBullet(doc, block.runs, left, width);
        break;
      case "ordered":
        renderOrdered(doc, block.runs, block.index, left, width);
        break;
      case "table":
        renderTable(doc, block.headers, block.rows, left, width);
        doc.moveDown(0.25);
        break;
    }
  }
}

function renderRuns(
  doc: typeof PDFDocument.prototype,
  runs: TextRun[],
  x: number,
  width: number,
  size: number,
  indent: number,
) {
  doc.x = x + indent;
  doc.fontSize(size).fillColor(COLORS.ink);
  runs.forEach((run, idx) => {
    const isLast = idx === runs.length - 1;
    const font =
      run.bold && run.italic
        ? "Helvetica-BoldOblique"
        : run.bold
          ? "Helvetica-Bold"
          : run.italic
            ? "Helvetica-Oblique"
            : "Helvetica";
    doc
      .font(font)
      .text(run.text, {
        width: width - indent,
        continued: !isLast,
        lineGap: 1.5,
      });
  });
  doc.x = x;
}

function renderBullet(
  doc: typeof PDFDocument.prototype,
  runs: TextRun[],
  x: number,
  width: number,
) {
  const indent = 14;
  const startY = doc.y;
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(COLORS.ink)
    .text("•", x, startY, { width: indent, continued: false });
  doc.y = startY;
  renderRuns(doc, runs, x, width, 9.5, indent);
}

function renderOrdered(
  doc: typeof PDFDocument.prototype,
  runs: TextRun[],
  index: number,
  x: number,
  width: number,
) {
  const indent = 18;
  const startY = doc.y;
  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor(COLORS.ink)
    .text(`${index}.`, x, startY, { width: indent, continued: false });
  doc.y = startY;
  renderRuns(doc, runs, x, width, 9.5, indent);
}

function renderTable(
  doc: typeof PDFDocument.prototype,
  headers: string[],
  rows: string[][],
  x: number,
  width: number,
) {
  if (headers.length === 0) return;
  const cols = headers.length;
  const colWidth = width / cols;
  const padX = 5;
  const padY = 3;
  const fontSize = 8.5;

  // Compute row heights based on content
  const measure = (s: string) =>
    doc.font("Helvetica").fontSize(fontSize).heightOfString(s, {
      width: colWidth - padX * 2,
    });

  const headerHeight = Math.max(
    ...headers.map((h) => measure(h)),
    fontSize + 2,
  ) + padY * 2;

  const rowHeights = rows.map(
    (row) =>
      Math.max(
        ...row.map((c, i) => (i < cols ? measure(c) : 0)),
        fontSize + 2,
      ) + padY * 2,
  );

  let y = doc.y;
  // Header background
  doc.rect(x, y, width, headerHeight).fill(COLORS.brandTint);
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(fontSize);
  for (let i = 0; i < cols; i++) {
    doc.text(headers[i], x + i * colWidth + padX, y + padY, {
      width: colWidth - padX * 2,
      align: "left",
    });
  }
  y += headerHeight;

  // Body rows
  doc.font("Helvetica").fontSize(fontSize).fillColor(COLORS.ink);
  rows.forEach((row, ri) => {
    const rh = rowHeights[ri];
    // Bottom border
    doc
      .strokeColor(COLORS.border)
      .lineWidth(0.4)
      .moveTo(x, y + rh)
      .lineTo(x + width, y + rh)
      .stroke();
    for (let i = 0; i < cols; i++) {
      const cell = row[i] ?? "";
      // Inline-format the cell (strip ** etc., bold the second column when
      // the cell is wrapped in bold markers).
      const stripped = cell.replace(/\*\*([^*]+)\*\*/g, "$1");
      const isBold = /^\*\*[^*]+\*\*$/.test(cell);
      doc
        .font(isBold ? "Helvetica-Bold" : "Helvetica")
        .fillColor(COLORS.ink)
        .text(stripped, x + i * colWidth + padX, y + padY, {
          width: colWidth - padX * 2,
          align: "left",
        });
    }
    y += rh;
  });

  doc.y = y + 2;
  doc.x = x;
}

function estimateBlocksHeight(
  doc: typeof PDFDocument.prototype,
  blocks: Block[],
  width: number,
): number {
  let h = 0;
  for (const b of blocks) {
    switch (b.kind) {
      case "para": {
        const text = b.runs.map((r) => r.text).join("");
        h +=
          doc
            .font("Helvetica")
            .fontSize(9.5)
            .heightOfString(text || " ", { width }) + 4;
        break;
      }
      case "bullet": {
        const text = b.runs.map((r) => r.text).join("");
        h +=
          doc
            .font("Helvetica")
            .fontSize(9.5)
            .heightOfString(text || " ", { width: width - 14 }) + 2;
        break;
      }
      case "ordered": {
        const text = b.runs.map((r) => r.text).join("");
        h +=
          doc
            .font("Helvetica")
            .fontSize(9.5)
            .heightOfString(text || " ", { width: width - 18 }) + 2;
        break;
      }
      case "table": {
        const cols = b.headers.length || 1;
        const colW = width / cols;
        const rowH = (cell: string) =>
          doc
            .font("Helvetica")
            .fontSize(9)
            .heightOfString(cell, { width: colW - 12 }) + 8;
        h += Math.max(rowH(b.headers.join(" ")), 14);
        for (const row of b.rows) {
          h += Math.max(...row.map((c) => rowH(c)), 14);
        }
        h += 4;
        break;
      }
    }
  }
  return h;
}

// ---------------------------------------------------------------------------
// Chrome (header / footer / rule)

function metadataLine(input: ArtifactInput): string {
  const { deal } = input;
  const acv = formatMoney(deal.acv);
  const tcv = formatMoney(deal.tcv);
  return `ACV ${acv}  ·  TCV ${tcv}  ·  Term ${deal.term_months}mo  ·  ${humanizeDealType(deal.deal_type)}  ·  AE ${deal.ae_owner}  ·  ${input.generatedAt.toISOString().slice(0, 10)}`;
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

function drawFooter(
  doc: typeof PDFDocument.prototype,
  input: ArtifactInput,
  approval: ArtifactInput["approval"],
) {
  const { deal, appUrl } = input;
  const left = PAGE_OPTS.margins.left;
  const usableW =
    doc.page.width - PAGE_OPTS.margins.left - PAGE_OPTS.margins.right;
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
      `Generated by Kiln · ${appUrl}/deals/${deal.id} · ${input.generatedAt.toISOString().slice(0, 10)} · ${approval.approval_chain.length}-step approval chain (~${approval.expected_cycle_time_business_days} business days)`,
      left,
      baseY + 12,
      { width: usableW, align: "left", lineBreak: false },
    );
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

function humanizeDealType(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
