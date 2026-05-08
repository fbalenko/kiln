import { readFileSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateFinancialModel } from "../lib/document-templates/spreadsheet/index.js";
import {
  ApprovalOutputSchema,
  Asc606OutputSchema,
  CommsOutputSchema,
  PricingOutputSchema,
  RedlineOutputSchema,
} from "../lib/agents/schemas.js";
import { getDealById } from "../lib/db/queries.js";

const dealId = "deal_anthropic_2026q1_expansion";
const path = join(process.cwd(), "db", "seed", "cached_outputs", `${dealId}-review.json`);
const parsed = JSON.parse(readFileSync(path, "utf-8")) as { outputs: Record<string, unknown>; synthesis?: string };
const deal = getDealById(dealId);
if (!deal) throw new Error("deal not found");

const input = {
  deal,
  pricing: PricingOutputSchema.parse(parsed.outputs.pricing),
  asc606: Asc606OutputSchema.parse(parsed.outputs.asc606),
  redline: RedlineOutputSchema.parse(parsed.outputs.redline),
  approval: ApprovalOutputSchema.parse(parsed.outputs.approval),
  comms: CommsOutputSchema.parse(parsed.outputs.comms),
  synthesis: typeof parsed.synthesis === "string" ? parsed.synthesis : "",
  reviewId: dealId,
  appUrl: "http://localhost:3000",
  generatedAt: new Date(),
};

async function main() {
  const artifact = await generateFinancialModel(input);
  const outPath = "/tmp/kiln-test-financial-model.xlsx";
  writeFileSync(outPath, artifact.buffer);
  console.log("wrote", artifact.buffer.byteLength, "bytes →", outPath);
  console.log("filename suggestion:", artifact.filename);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
