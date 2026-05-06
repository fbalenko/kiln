import {
  artifactFilename,
  type ArtifactInput,
  type ArtifactBuffer,
} from "./types";

// Render the AE email draft as a downloadable .eml file (RFC 5322).
// Kept dependency-free — building an .eml is a few headers + a body.
//
// docs/06-integrations.md §Email integration: we never send mail. The .eml
// download lets the visitor open in their mail client; the UI also exposes a
// mailto: shortcut for the same content.

export function generateAeEmail(input: ArtifactInput): ArtifactBuffer {
  const { deal, comms, appUrl } = input;
  const draft = comms.ae_email_draft;

  // Sender = the kiln demo system; To = the AE's first/last name with a
  // synthetic @clay.com address (this is a draft, not a real send).
  const aeName = (draft.to ?? deal.ae_owner ?? "AE").trim();
  const aeMailbox = aeName.toLowerCase().replace(/[^a-z0-9]+/g, ".");
  const fromAddr = "deal-desk@kiln.demo";
  const toAddr = `${aeMailbox || "ae"}@clay.com`;

  const headers = [
    `From: Kiln Deal Desk <${fromAddr}>`,
    `To: ${aeName} <${toAddr}>`,
    `Subject: ${encodeSubject(draft.subject)}`,
    `Date: ${rfc2822Date(input.generatedAt)}`,
    `Message-ID: <${input.reviewId}.ae@kiln.demo>`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    "MIME-Version: 1.0",
    `X-Kiln-Deal: ${deal.id}`,
    `X-Kiln-App: ${appUrl}/deals/${deal.id}`,
  ];

  const body = [
    `Hi ${firstName(aeName)},`,
    "",
    draft.body_markdown.trim(),
    "",
    "—",
    "Drafted by Kiln · review the full deal at:",
    `${appUrl}/deals/${deal.id}`,
    "",
    `Suggested send time: ${draft.suggested_send_time}`,
  ].join("\n");

  const eml = headers.join("\r\n") + "\r\n\r\n" + body.replace(/\n/g, "\r\n");
  const buffer = Buffer.from(eml, "utf-8");

  return {
    buffer,
    contentType: "message/rfc822",
    filename: artifactFilename(input, "ae-email"),
    byteLength: buffer.byteLength,
  };
}

// Lightweight subject encoder. Plain-ASCII subjects pass through verbatim;
// anything with non-ASCII gets MIME encoded-word (RFC 2047) so mail clients
// don't garble it.
function encodeSubject(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const b64 = Buffer.from(s, "utf-8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

function rfc2822Date(d: Date): string {
  return d.toUTCString().replace("GMT", "+0000");
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || "there";
}
