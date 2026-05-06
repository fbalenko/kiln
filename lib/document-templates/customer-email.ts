import {
  artifactFilename,
  type ArtifactInput,
  type ArtifactBuffer,
} from "./types";

// Render the customer-facing email draft as a downloadable .eml file.
// Same pattern as ae-email.ts but addressed to a synthetic
// <to_role>@<customer.domain> address.

export function generateCustomerEmail(input: ArtifactInput): ArtifactBuffer {
  const { deal, comms, appUrl } = input;
  const draft = comms.customer_email_draft;

  const fromAddr = `${deal.ae_owner.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@clay.com`;
  const toAddr = `${draft.to_role.replace(/[^a-z0-9_]+/g, "_")}@${deal.customer.domain}`;

  const headers = [
    `From: ${deal.ae_owner} <${fromAddr}>`,
    `To: ${humanizeRole(draft.to_role)} <${toAddr}>`,
    `Subject: ${encodeSubject(draft.subject)}`,
    `Date: ${rfc2822Date(input.generatedAt)}`,
    `Message-ID: <${input.reviewId}.customer@kiln.demo>`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    "MIME-Version: 1.0",
    `X-Kiln-Deal: ${deal.id}`,
    `X-Kiln-Tone: ${draft.tone}`,
  ];

  const body = [
    draft.body_markdown.trim(),
    "",
    "—",
    `${deal.ae_owner}, Clay`,
    "",
    "(Drafted with Kiln · this is a draft for AE review, not yet sent.)",
  ].join("\n");

  const eml = headers.join("\r\n") + "\r\n\r\n" + body.replace(/\n/g, "\r\n");
  const buffer = Buffer.from(eml, "utf-8");

  return {
    buffer,
    contentType: "message/rfc822",
    filename: artifactFilename(input, "customer-email"),
    byteLength: buffer.byteLength,
  };
}

function humanizeRole(role: string): string {
  return role
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

function encodeSubject(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const b64 = Buffer.from(s, "utf-8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

function rfc2822Date(d: Date): string {
  return d.toUTCString().replace("GMT", "+0000");
}
