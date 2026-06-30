/**
 * MFM points import script (CLI variant).
 *
 * Fetches the latest points values from mfm.warhammer-community.com,
 * matches them to Wahapedia datasheet IDs by name, and writes the
 * official minimum cost into Datasheets_models_cost.
 *
 * Run this AFTER a Wahapedia import — a Wahapedia refresh will
 * repopulate Datasheets_models_cost with its own values, so MFM
 * should always be the last import step.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/import/mfm.ts [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import { fetchAllMfmCosts, applyMfmImport } from "./mfmCore";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (dryRun) {
    console.log("Dry run — fetching MFM data only, no DB writes.");
    const costs = await fetchAllMfmCosts();
    console.log(`\nTotal units parsed: ${costs.size}`);
    for (const [name, cost] of costs) {
      console.log(`  ${name}: ${cost} pts`);
    }
    return;
  }

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const result = await applyMfmImport(supabase);

  console.log(`\nMFM import complete.`);
  console.log(`  MFM units found:  ${result.totalMfmUnits}`);
  console.log(`  Matched + updated: ${result.matched}`);
  console.log(`  Unmatched:         ${result.unmatched.length}`);
}

main().catch((err) => {
  console.error("MFM import failed:", err);
  process.exit(1);
});
