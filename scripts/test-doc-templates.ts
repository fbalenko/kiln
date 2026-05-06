import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDealById } from "@/lib/db/queries";
import { generateAeEmail } from "@/lib/document-templates/ae-email";
import { generateCustomerEmail } from "@/lib/document-templates/customer-email";
import { generateApprovalOnePager } from "@/lib/document-templates/approval-one-pager";
import { generateOrderForm } from "@/lib/document-templates/order-form";
import { generateRedlinedMsa } from "@/lib/document-templates/redlined-msa";
import type { ArtifactInput } from "@/lib/document-templates/types";

async function main() {
  const dealId = "deal_anthropic_2026q1_expansion";
  const deal = getDealById(dealId);
  if (!deal) throw new Error("deal not found");

  const cache = JSON.parse(
    readFileSync(
      join(process.cwd(), "db/seed/cached_outputs", `${dealId}-review.json`),
      "utf-8",
    ),
  );

  const input: ArtifactInput = {
    deal,
    pricing: cache.outputs.pricing,
    asc606: cache.outputs.asc606,
    redline: cache.outputs.redline,
    approval: cache.outputs.approval,
    comms: cache.outputs.comms,
    synthesis: cache.synthesis,
    reviewId: "rev_test_smoke",
    appUrl: "http://localhost:3000",
    generatedAt: new Date(),
  };

  mkdirSync("/tmp/kiln-artifacts", { recursive: true });

  const ae = generateAeEmail(input);
  writeFileSync(`/tmp/kiln-artifacts/${ae.filename}`, ae.buffer);
  console.log(
    `[ae-email] ${ae.filename} (${(ae.byteLength / 1024).toFixed(1)} KB)`,
  );

  const cust = generateCustomerEmail(input);
  writeFileSync(`/tmp/kiln-artifacts/${cust.filename}`, cust.buffer);
  console.log(
    `[customer-email] ${cust.filename} (${(cust.byteLength / 1024).toFixed(1)} KB)`,
  );

  const onePager = await generateApprovalOnePager(input);
  writeFileSync(`/tmp/kiln-artifacts/${onePager.filename}`, onePager.buffer);
  console.log(
    `[approval-one-pager] ${onePager.filename} (${(onePager.byteLength / 1024).toFixed(1)} KB)`,
  );

  const orderForm = await generateOrderForm(input);
  writeFileSync(`/tmp/kiln-artifacts/${orderForm.filename}`, orderForm.buffer);
  console.log(
    `[order-form] ${orderForm.filename} (${(orderForm.byteLength / 1024).toFixed(1)} KB)`,
  );

  const msa = await generateRedlinedMsa(input);
  writeFileSync(`/tmp/kiln-artifacts/${msa.filename}`, msa.buffer);
  console.log(
    `[redlined-msa] ${msa.filename} (${(msa.byteLength / 1024).toFixed(1)} KB)`,
  );
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
