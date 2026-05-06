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

const DEAL_IDS = [
  "deal_anthropic_2026q1_expansion",
  "deal_northbeam_2026_renewal",
  "deal_notion_2026_enterprise_conversion",
  "deal_reverberate_2026_partnership",
  "deal_tessera_2026_displacement",
];

async function runDeal(dealId: string) {
  const deal = getDealById(dealId);
  if (!deal) throw new Error(`deal not found: ${dealId}`);

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
    reviewId: `rev_test_${dealId.slice(0, 8)}`,
    appUrl: "http://localhost:3000",
    generatedAt: new Date(),
  };

  console.log(`\n=== ${dealId} ===`);

  const ae = generateAeEmail(input);
  writeFileSync(`/tmp/kiln-artifacts/${ae.filename}`, ae.buffer);
  console.log(`  ae-email          ${(ae.byteLength / 1024).toFixed(1)} KB`);

  const cust = generateCustomerEmail(input);
  writeFileSync(`/tmp/kiln-artifacts/${cust.filename}`, cust.buffer);
  console.log(`  customer-email    ${(cust.byteLength / 1024).toFixed(1)} KB`);

  const onePager = await generateApprovalOnePager(input);
  writeFileSync(`/tmp/kiln-artifacts/${onePager.filename}`, onePager.buffer);
  console.log(`  one-pager         ${(onePager.byteLength / 1024).toFixed(1)} KB`);

  const orderForm = await generateOrderForm(input);
  writeFileSync(`/tmp/kiln-artifacts/${orderForm.filename}`, orderForm.buffer);
  console.log(`  order-form        ${(orderForm.byteLength / 1024).toFixed(1)} KB`);

  const msa = await generateRedlinedMsa(input);
  writeFileSync(`/tmp/kiln-artifacts/${msa.filename}`, msa.buffer);
  console.log(`  redlined-msa      ${(msa.byteLength / 1024).toFixed(1)} KB`);
}

async function main() {
  mkdirSync("/tmp/kiln-artifacts", { recursive: true });
  const target = process.argv[2];
  if (target === "--all") {
    for (const id of DEAL_IDS) await runDeal(id);
  } else {
    await runDeal(target ?? DEAL_IDS[0]);
  }
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
