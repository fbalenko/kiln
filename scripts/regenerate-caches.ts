/**
 * Regenerate orchestrator cache files for hero scenarios.
 *
 * Usage:
 *   npx tsx scripts/regenerate-caches.ts <dealId>            # single deal
 *   npx tsx scripts/regenerate-caches.ts --all               # all 5 hero deals
 */

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { runOrchestrator } from "@/lib/agents/orchestrator";

const HERO_DEALS = [
  "deal_anthropic_2026q1_expansion",
  "deal_notion_2026_enterprise_conversion",
  "deal_tessera_2026_displacement",
  "deal_northbeam_2026_renewal",
  "deal_reverberate_2026_partnership",
];

async function regenerate(dealId: string) {
  console.log(`\n──────── ${dealId} ────────`);
  const start = Date.now();
  let lastParent = "";
  const result = await runOrchestrator(dealId, {
    forceRefresh: true,
    onSubstep: (e) => {
      if (e.parent !== lastParent) {
        process.stdout.write(`\n  [${e.parent}] `);
        lastParent = e.parent;
      }
      const status = e.status === "complete" ? "✓" : e.status === "running" ? "·" : "✗";
      process.stdout.write(`${status}`);
    },
  });
  const wall = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `\n  done in ${wall}s | input ${result.metadata.total_input_tokens.toLocaleString()} | output ${result.metadata.total_output_tokens.toLocaleString()} | est $${result.metadata.total_cost_usd.toFixed(4)}`,
  );
  return result;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: tsx scripts/regenerate-caches.ts <dealId>|--all");
    process.exit(1);
  }
  const targets = arg === "--all" ? HERO_DEALS : [arg];
  let totalCost = 0;
  for (const dealId of targets) {
    try {
      const r = await regenerate(dealId);
      totalCost += r.metadata.total_cost_usd;
    } catch (err) {
      console.error(`\n  ✗ FAILED ${dealId}:`, err);
      process.exit(2);
    }
  }
  console.log(`\n\n=== total est cost across ${targets.length} deal(s): $${totalCost.toFixed(4)} ===`);
}

main();
