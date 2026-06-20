/**
 * Wahadle data refresh script (CLI / local-files variant).
 *
 * Most people should use the admin page instead: /admin/units has
 * a "Check for updates" button that does this same thing, fetching
 * directly from wahapedia.ru, with a preview before applying. This
 * CLI script exists for cases the web UI can't handle well -- a
 * refresh that's too large/slow for one HTTP request's time limit,
 * or running against export files you've edited/patched locally
 * before importing.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/import/refresh.ts [--dir ./wahapedia-export] [--dry-run]
 *
 * Why the service role key here specifically, when the rest of
 * the app deliberately never uses it (see app/lib/supabase/server.ts):
 * this script needs to write reference data regardless of which
 * human is running it, including bulk deletes that the "Admin
 * write access" RLS policies would also allow for a signed-in
 * admin -- but a long-running offline script isn't a browser
 * session and has no admin user signed in. Using the service
 * role key here, in a script that only ever runs locally on your
 * machine and never ships to a server or browser, is the
 * appropriate exception to that rule, not a reversal of it.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { parseExport, computeDiff, applyImport, type WahapediaExportFiles } from "./core";

type Args = {
  dir: string;
  dryRun: boolean;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const dirIdx = args.indexOf("--dir");
  const dir = dirIdx >= 0 ? args[dirIdx + 1] : "./wahapedia-export";
  const dryRun = args.includes("--dry-run");
  return { dir, dryRun };
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return v;
}

const COST_FILE_CANDIDATES = [
  "Datasheets_models_cost.csv",
  "DS_Model Costs.csv",
  "Datasheets_unit_composition.csv",
];

function readLocalExportFiles(dir: string): WahapediaExportFiles {
  const read = (filename: string) =>
    fs.readFileSync(path.join(dir, filename), "utf-8");

  let costFilename: string | null = null;
  for (const candidate of COST_FILE_CANDIDATES) {
    if (fs.existsSync(path.join(dir, candidate))) {
      costFilename = candidate;
      break;
    }
  }
  if (!costFilename) {
    console.error(
      `Could not find a cost file in ${dir}. Tried: ${COST_FILE_CANDIDATES.join(", ")}.`
    );
    process.exit(1);
  }
  console.log(`Using cost file: ${costFilename}`);

  return {
    factionsCsv: read("Factions.csv"),
    sourceCsv: read("Source.csv"),
    datasheetsCsv: read("Datasheets.csv"),
    modelsCsv: read("Datasheets_models.csv"),
    costCsv: read(costFilename),
    keywordsCsv: read("Datasheets_keywords.csv"),
  };
}

async function main() {
  const { dir, dryRun } = parseArgs();
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log(`Reading export files from ${dir}${dryRun ? " (dry run)" : ""}`);
  const files = readLocalExportFiles(dir);
  const parsed = parseExport(files);

  console.log(`Factions: ${parsed.factions.length} in export`);
  console.log(`Source: ${parsed.sources.length} in export`);
  console.log(`Datasheets: ${parsed.datasheets.length} in export`);
  console.log(`Datasheets_models: ${parsed.models.length} in export`);
  console.log(`Datasheets_models_cost: ${parsed.costs.length} in export`);
  console.log(`Datasheets_keywords: ${parsed.keywords.length} in export`);

  const diff = await computeDiff(supabase, parsed);
  console.log(`New datasheets: ${diff.newDatasheets.length}`);
  console.log(`Changed datasheets (name/faction): ${diff.changedDatasheets.length}`);
  console.log(`Soft-deleted (referenced by past daily/round answers): ${diff.softDeletedDatasheets.length}`);
  console.log(`Hard-deleted: ${diff.hardDeletedDatasheets.length}`);

  if (dryRun) {
    console.log("Dry run complete, no changes applied.");
    return;
  }

  await applyImport(supabase, parsed);
  console.log("Refresh complete.");
}

main().catch((err) => {
  console.error("Refresh failed:", err);
  process.exit(1);
});
