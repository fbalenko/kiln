import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  AlignmentType,
  TextRun,
  Header,
  Footer,
  PageNumber,
  PageOrientation,
} from "docx";
import {
  artifactFilename,
  KILN_DISCLAIMER,
  type ArtifactInput,
  type ArtifactBuffer,
} from "./types";

// Master Services Agreement template, populated with the customer's proposed
// non-standard clauses + Kiln's suggested counters. Paragraphs flagged as
// counters render in clay-blue with a "Suggested revision" prefix so a
// reviewer scanning the document can see at a glance where Clay is pushing
// back. Standard boilerplate paragraphs render in plain ink.
//
// We skip the docx package's tracked-changes API because reliable
// cross-platform rendering of <w:ins>/<w:del> is brittle. Inline color +
// strikethrough captures the same intent — a Word/Pages reviewer can adopt
// the suggestions with one keystroke.

const COLORS = {
  brand: "3B82F6",
  ink: "0A0A0A",
  muted: "737373",
  red: "B91C1C",
};

const FONT = "Inter"; // Word will fall back to Calibri/Helvetica if Inter
                       // is missing — that's fine for Pages/Word on most
                       // machines; we don't ship the font file.

export async function generateRedlinedMsa(
  input: ArtifactInput,
): Promise<ArtifactBuffer> {
  const { deal, redline, asc606 } = input;

  const doc = new Document({
    creator: "Kiln",
    title: `MSA — ${deal.customer.name}`,
    description: `Master Services Agreement draft for ${deal.customer.name}`,
    styles: {
      default: {
        document: {
          run: {
            font: FONT,
            size: 22, // 11pt — half-points
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT },
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, // 1" = 1440 twip
          },
        },
        headers: { default: new Header({ children: [headerPara(input)] }) },
        footers: { default: new Footer({ children: [footerPara(input)] }) },
        children: buildBody(input, deal, redline, asc606),
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return {
    buffer: Buffer.from(buffer),
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    filename: artifactFilename(input, "redlined-msa"),
    byteLength: buffer.length,
  };
}

// ---------------------------------------------------------------------------

function buildBody(
  input: ArtifactInput,
  deal: ArtifactInput["deal"],
  redline: ArtifactInput["redline"],
  asc606: ArtifactInput["asc606"],
): Paragraph[] {
  const out: Paragraph[] = [];

  // Title block
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: "MASTER SERVICES AGREEMENT",
          bold: true,
          size: 32,
          color: COLORS.ink,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: `Between Clay, Inc. (“Clay”) and ${deal.customer.name} (“Customer”)`,
          color: COLORS.ink,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: `Effective: ${input.generatedAt.toISOString().slice(0, 10)} · Term: ${deal.term_months} months · TCV: ${formatMoney(deal.tcv)}`,
          color: COLORS.muted,
          size: 18,
        }),
      ],
    }),
  );

  // Disclaimer banner
  out.push(
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: "Document status: ",
          bold: true,
          color: COLORS.brand,
        }),
        new TextRun({
          text: `Draft for review. Counter-positions surfaced by Kiln render in clay-blue with the “Suggested revision:” prefix. Customer-proposed language flagged as risk renders with strikethrough. Adopt or reject each revision before signing. ${KILN_DISCLAIMER}`,
          color: COLORS.muted,
          italics: true,
        }),
      ],
    }),
  );

  // ---- 1. Subscription scope ----
  out.push(...section("1. Subscription scope", [
    bodyPara(
      `Clay shall provide Customer with access to the Clay platform on a ${humanize(deal.pricing_model)} basis for the duration of the Term, with annual contract value of ${formatMoney(deal.acv)} (Total Contract Value: ${formatMoney(deal.tcv)} over ${deal.term_months} months).`,
    ),
    bodyPara(
      `The proposed price reflects a headline discount of ${deal.discount_pct.toFixed(1)}% from list. ${deal.discount_reason ? `Discount rationale: ${deal.discount_reason}` : ""}`,
    ),
  ]));

  // ---- 2. Standard terms (boilerplate) ----
  out.push(...section("2. Standard terms", [
    bodyPara(
      "Customer Data remains the property of Customer. Clay shall maintain commercially reasonable safeguards consistent with industry standards (SOC 2 Type II, ISO 27001).",
    ),
    bodyPara(
      "Either party may terminate this Agreement for material breach upon thirty (30) days written notice and a reasonable opportunity to cure.",
    ),
    bodyPara(
      "All notices shall be sent to the addresses on the executed Order Form. Governing law: Delaware.",
    ),
  ]));

  // ---- 3. Non-standard clauses (the meat — customer requests + counters) ----
  if (redline.flagged_clauses.length > 0) {
    out.push(headingPara("3. Non-standard clauses & negotiated positions"));
    out.push(
      bodyPara(
        `The following clauses were proposed by Customer and reviewed by Clay's deal desk. Each entry shows the Customer-proposed language (struck through if Clay is countering) followed by Clay's suggested revision in clay-blue. The fallback position represents Clay's walk-away alternative.`,
      ),
    );

    redline.flagged_clauses.forEach((clause, idx) => {
      out.push(
        new Paragraph({
          spacing: { before: 240, after: 80 },
          children: [
            new TextRun({
              text: `3.${idx + 1} ${humanize(clause.clause_type)}`,
              bold: true,
              size: 24,
              color: COLORS.ink,
            }),
            new TextRun({
              text: `   risk: ${clause.risk_level}`,
              color:
                clause.risk_level === "high"
                  ? COLORS.red
                  : clause.risk_level === "medium"
                    ? COLORS.brand
                    : COLORS.muted,
              size: 16,
              italics: true,
            }),
          ],
        }),
        bodyPara(`Risk explanation: ${clause.risk_explanation}`, {
          color: COLORS.muted,
          italics: true,
        }),
        new Paragraph({
          spacing: { before: 120, after: 60 },
          children: [
            new TextRun({
              text: "Customer-proposed:  ",
              bold: true,
              color: COLORS.muted,
              size: 18,
            }),
            new TextRun({
              text: clause.customer_proposed_language,
              color: COLORS.ink,
              strike: true, // marks as proposed-but-superseded
            }),
          ],
        }),
        new Paragraph({
          spacing: { before: 60, after: 60 },
          children: [
            new TextRun({
              text: "Suggested revision:  ",
              bold: true,
              color: COLORS.brand,
              size: 18,
            }),
            new TextRun({
              text: clause.suggested_counter,
              color: COLORS.brand,
            }),
          ],
        }),
        new Paragraph({
          spacing: { before: 60, after: 120 },
          children: [
            new TextRun({
              text: "Fallback position:  ",
              bold: true,
              color: COLORS.muted,
              size: 18,
            }),
            new TextRun({
              text: clause.fallback_position,
              color: COLORS.muted,
              italics: true,
            }),
          ],
        }),
        ...(clause.precedent_notes
          ? [
              new Paragraph({
                spacing: { after: 120 },
                children: [
                  new TextRun({
                    text: `Precedent: ${clause.precedent_notes}`,
                    color: COLORS.muted,
                    size: 16,
                    italics: true,
                  }),
                ],
              }),
            ]
          : []),
      );
    });
  }

  // ---- 4. ASC 606 considerations ----
  out.push(...section("4. Revenue recognition (ASC 606)", [
    bodyPara(
      `Clay's accounting team has reviewed this contract under ASC 606. ${asc606.contract_modification_risk.is_at_risk ? "Note: this contract carries elevated modification risk — see explanation below." : "No elevated modification risk identified."}`,
    ),
    bodyPara(asc606.contract_modification_risk.explanation, {
      color: COLORS.muted,
      italics: true,
    }),
    ...(asc606.variable_consideration_flags.length > 0
      ? [
          bodyPara(
            "Variable-consideration sources identified in this contract:",
          ),
          ...asc606.variable_consideration_flags.map(
            (f) =>
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: `• ${humanize(f.source)}: `,
                    bold: true,
                    color: COLORS.ink,
                  }),
                  new TextRun({
                    text: `${f.treatment_required} (estimation difficulty: ${f.estimation_difficulty}). ${f.explanation}`,
                    color: COLORS.muted,
                  }),
                ],
              }),
          ),
        ]
      : []),
  ]));

  // ---- 5. Affirmed standard clauses ----
  if (redline.standard_clauses_affirmed.length > 0) {
    out.push(...section("5. Affirmed standard clauses", [
      bodyPara(
        `The following standard clauses are affirmed unchanged: ${redline.standard_clauses_affirmed.join("; ")}.`,
        { color: COLORS.muted },
      ),
    ]));
  }

  // ---- Signature block ----
  out.push(
    new Paragraph({
      spacing: { before: 600, after: 120 },
      children: [
        new TextRun({
          text: "EXECUTION",
          bold: true,
          color: COLORS.ink,
          size: 24,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 180 },
      children: [
        new TextRun({
          text: `For Customer (${deal.customer.name}): _____________________________   Name: ___________________   Title: ___________________   Date: __________`,
          color: COLORS.ink,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 180 },
      children: [
        new TextRun({
          text: "For Clay, Inc.: _____________________________   Name: ___________________   Title: ___________________   Date: __________",
          color: COLORS.ink,
        }),
      ],
    }),
  );

  return out;
}

function section(heading: string, body: Paragraph[]): Paragraph[] {
  return [headingPara(heading), ...body];
}

function headingPara(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        color: COLORS.brand,
        size: 26,
      }),
    ],
  });
}

function bodyPara(
  text: string,
  opts: { color?: string; italics?: boolean } = {},
): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({
        text,
        color: opts.color ?? COLORS.ink,
        italics: opts.italics ?? false,
      }),
    ],
  });
}

function headerPara(input: ArtifactInput): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    children: [
      new TextRun({
        text: `MSA · ${input.deal.customer.name} · Draft (Kiln-generated)`,
        color: COLORS.muted,
        size: 16,
      }),
    ],
  });
}

function footerPara(input: ArtifactInput): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    children: [
      new TextRun({
        text: `Generated by Kiln · ${input.appUrl}/deals/${input.deal.id}    Page `,
        color: COLORS.muted,
        size: 16,
      }),
      new TextRun({
        children: [PageNumber.CURRENT],
        color: COLORS.muted,
        size: 16,
      }),
    ],
  });
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
