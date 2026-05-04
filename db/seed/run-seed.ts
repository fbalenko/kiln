import { getDb } from "@/lib/db/client";
import { embedAllDeals } from "@/lib/db/embeddings";
import { seedApprovalMatrix } from "./approval-matrix";
import { seedCustomers } from "./customers";
import { seedAdditionalDeals } from "./deals";
import { seedGuardrails } from "./guardrails";
import { seedScenarios } from "./scenarios";

async function main(): Promise<void> {
  const db = getDb();

  const customers = seedCustomers(db);
  console.log(`✓ ${customers} customers`);

  const scenarios = seedScenarios(db);
  console.log(`✓ ${scenarios} hero scenarios`);

  const deals = seedAdditionalDeals(db);
  console.log(`✓ ${deals} additional deals`);

  const guardrails = seedGuardrails(db);
  console.log(`✓ ${guardrails} pricing guardrails`);

  const matrix = seedApprovalMatrix(db);
  console.log(`✓ ${matrix} approval-matrix rules`);

  if (process.env.SKIP_EMBEDDINGS === "1") {
    console.log("• embeddings skipped (SKIP_EMBEDDINGS=1)");
  } else {
    const embeds = await embedAllDeals(db);
    console.log(`✓ ${embeds} deal embeddings (text-embedding-3-small)`);
  }

  const totalDeals = db
    .prepare("SELECT COUNT(*) AS n FROM deals")
    .get() as { n: number };
  console.log(`\nTotal deals in DB: ${totalDeals.n}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
