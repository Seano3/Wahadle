/**
 * Import unit data from 40kdc-data (replaces the Wahapedia + MFM
 * imports -- don't run those afterwards, they would undo this). See
 * kdcCore.ts for the matching rules.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/import/kdc.ts [--dry-run] [--ref <git ref>] [--out ./kdc-import]
 *
 * Always writes <out>/plan.json (and, for a real run, a backup.json
 * of the affected tables taken immediately before writing).
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fetchKdc, buildPlan, applyPlan, backupTables } from "./kdcCore";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

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
  const ref = arg("--ref", "main");
  const outDir = arg("--out", "./kdc-import");
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  console.log(`Fetching 40kdc-data @ ${ref} ...`);
  const kdc = await fetchKdc(ref);
  console.log(`  ${kdc.units.length} units, commit ${kdc.sha.slice(0, 7)} (${kdc.date})`);

  console.log("Building plan against the database ...");
  const plan = await buildPlan(supabase, kdc);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "plan.json"), JSON.stringify(plan, null, 2));

  const list = (title: string, xs: { id: string; name: string | null; faction: string }[], max = 15) => {
    console.log(`\n${title}: ${xs.length}`);
    for (const x of xs.slice(0, max)) console.log(`    ${x.faction} - ${x.name} (${x.id})`);
    if (xs.length > max) console.log(`    ... (${xs.length - max} more in plan.json)`);
  };

  console.log(`\nMatched to existing ids: ${plan.matched} (Legends datasheets left untouched: ${plan.unchangedLegends})`);
  list("Matched by loose name (check these)", plan.matchedLoosely, 50);
  list("Frozen until tomorrow (current daily answer)", plan.frozen);
  list("New datasheets", plan.added, 40);
  list("Skipped same-name duplicates in 40kdc", plan.skippedDuplicates);
  list("Hidden (removed=true, referenced by past games)", plan.softDelete, 40);
  list("Deleted (never referenced)", plan.hardDelete, 40);
  console.log(`\nNew factions: ${plan.newFactions.map((f) => f.name).join(", ") || "none"}`);
  console.log(`Model lines to write: ${plan.models.length}, stale lines to delete: ${plan.staleModelLines.length}`);
  console.log(`Old lines kept (a past game references them), stats refreshed: ${plan.keptReferencedLines.length}`);
  for (const l of plan.keptReferencedLines) console.log(`    ${l.datasheet_id}::${l.line} ${l.name}`);
  console.log(`Cost lines to write: ${plan.costs.length}`);

  if (dryRun) {
    console.log(`\nDry run -- nothing written. Plan saved to ${path.resolve(outDir)}/plan.json`);
    return;
  }

  console.log("\nBacking up tables ...");
  fs.writeFileSync(path.join(outDir, "backup.json"), JSON.stringify(await backupTables(supabase)));
  console.log(`  saved ${path.resolve(outDir)}/backup.json`);

  console.log("Applying ...");
  await applyPlan(supabase, plan);
  console.log("\nDone. Credit 40kdc-data (CC BY 4.0) on the site.");
}

main().catch((err) => {
  console.error("40kdc import failed:", err);
  process.exit(1);
});
