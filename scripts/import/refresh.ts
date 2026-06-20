/**
 * Wahadle data refresh script.
 *
 * Run this from your own machine (it needs network access to
 * wahapedia.ru, which the app's own server environment doesn't
 * need and shouldn't have). Downloads the current Wahapedia
 * export for the given edition path, diffs it against what's in
 * Supabase, and applies the result:
 *
 *   - Datasheets/Factions/Source rows present in the export are
 *     upserted (insert new, update changed fields).
 *   - Datasheets NOT in the export are deleted -- hard-deleted if
 *     never referenced by a daily_targets or rounds row, soft-
 *     deleted (removed = true) if they were, so a historical
 *     daily answer never points at nothing. See
 *     supabase/05_import_safe_deletes.sql for the schema side of
 *     this.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/import/refresh.ts [--edition wh40k10ed] [--dry-run]
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
import {
  parsePipeDelimited,
  emptyToNull,
  parseBool,
  parseIntOrNull,
} from "./csv";

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

async function main() {
  const { dir, dryRun } = parseArgs();
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log(`Reading export files from ${dir}${dryRun ? " (dry run)" : ""}`);

  // ----------------------------
  // Factions
  // ----------------------------
  const factionRows = parsePipeDelimited(path.join(dir, "Factions.csv")).map(
    (r) => ({
      id: r.id,
      name: r.name,
      link: emptyToNull(r.link),
    })
  );
  console.log(`Factions: ${factionRows.length} in export`);
  if (!dryRun) {
    const { error } = await supabase.from("Factions").upsert(factionRows);
    if (error) throw error;
  }

  // ----------------------------
  // Source
  // ----------------------------
  const sourceRows = parsePipeDelimited(path.join(dir, "Source.csv")).map(
    (r) => {
      const name = r.name ?? "";
      const isLegends =
        name.toLowerCase().includes("legends") ||
        name.toLowerCase().startsWith("black library");
      return {
        id: r.id,
        name,
        type: emptyToNull(r.type),
        edition: emptyToNull(r.edition),
        version: emptyToNull(r.version),
        errata_date: emptyToNull(r.errata_date),
        errata_link: emptyToNull(r.errata_link),
        is_legends: isLegends,
      };
    }
  );
  console.log(`Source: ${sourceRows.length} in export`);
  if (!dryRun) {
    const { error } = await supabase.from("Source").upsert(sourceRows);
    if (error) throw error;
  }

  // ----------------------------
  // Datasheets
  // ----------------------------
  const datasheetRows = parsePipeDelimited(path.join(dir, "Datasheets.csv"));
  const datasheets = datasheetRows.map((r) => ({
    id: r.id,
    name: emptyToNull(r.name),
    faction_id: emptyToNull(r.faction_id),
    source_id: emptyToNull(r.source_id),
    legend: emptyToNull(r.legend),
    role: emptyToNull(r.role),
    loadout: emptyToNull(r.loadout),
    transport: emptyToNull(r.transport),
    virtual: parseBool(r.virtual),
    leader_head: emptyToNull(r.leader_head),
    leader_footer: emptyToNull(r.leader_footer),
    damaged_w: emptyToNull(r.damaged_w),
    damaged_description: emptyToNull(r.damaged_description),
    link: emptyToNull(r.link),
    removed: false,
  }));
  const exportDatasheetIds = new Set(datasheets.map((d) => d.id));
  console.log(`Datasheets: ${datasheets.length} in export`);

  if (!dryRun) {
    // Upsert in batches -- a single request with 1000+ rows of
    // mostly-text data risks hitting request size limits.
    const BATCH = 200;
    for (let i = 0; i < datasheets.length; i += BATCH) {
      const { error } = await supabase
        .from("Datasheets")
        .upsert(datasheets.slice(i, i + BATCH));
      if (error) throw error;
    }
  }

  // ----------------------------
  // Datasheets_models
  // ----------------------------
  const modelRows = parsePipeDelimited(path.join(dir, "Datasheets_models.csv"));
  const models = modelRows
    .filter((r) => exportDatasheetIds.has(r.datasheet_id))
    .map((r) => ({
      datasheet_id: r.datasheet_id,
      line: parseIntOrNull(r.line) ?? 0,
      name: emptyToNull(r.name),
      M: emptyToNull(r.M),
      T: emptyToNull(r.T),
      Sv: emptyToNull(r.Sv),
      inv_sv: emptyToNull(r.inv_sv),
      inv_sv_descr: emptyToNull(r.inv_sv_descr),
      W: emptyToNull(r.W),
      Ld: emptyToNull(r.Ld),
      OC: emptyToNull(r.OC),
      base_size: emptyToNull(r.base_size),
      base_size_descr: emptyToNull(r.base_size_descr),
    }));
  console.log(`Datasheets_models: ${models.length} in export`);
  if (!dryRun) {
    const BATCH = 200;
    for (let i = 0; i < models.length; i += BATCH) {
      const { error } = await supabase
        .from("Datasheets_models")
        .upsert(models.slice(i, i + BATCH), { onConflict: "datasheet_id,line" });
      if (error) throw error;
    }
  }

  // ----------------------------
  // Datasheets_models_cost
  //
  // Wahapedia's filename for this table has varied across export
  // revisions ("Datasheets_unit_composition.csv" in some, "DS_Model
  // Costs.csv" in others) and may change again for the 11th-edition
  // export, which doesn't exist yet as of writing this script --
  // see the README in this directory. Try each known candidate
  // rather than betting on one and silently importing zero cost
  // rows if it's wrong.
  // ----------------------------
  const costFileCandidates = [
    "Datasheets_unit_composition.csv",
    "DS_Model Costs.csv",
    "Datasheets_models_cost.csv",
  ];
  let costFilePath: string | null = null;
  for (const candidate of costFileCandidates) {
    if (fs.existsSync(path.join(dir, candidate))) {
      costFilePath = path.join(dir, candidate);
      break;
    }
  }
  if (!costFilePath) {
    console.error(
      `Could not find a cost/unit-composition file. Tried: ${costFileCandidates.join(", ")}.\n` +
        `Check the export directory and update costFileCandidates in this script if Wahapedia's filename has changed.`
    );
    process.exit(1);
  }
  console.log(`Using cost file: ${path.basename(costFilePath)}`);

  const costRows = parsePipeDelimited(costFilePath);
  const costs = costRows
    .filter((r) => exportDatasheetIds.has(r.datasheet_id))
    .map((r) => ({
      datasheet_id: r.datasheet_id,
      line: parseIntOrNull(r.line) ?? 0,
      description: emptyToNull(r.description),
      cost: parseIntOrNull(r.cost),
    }));
  console.log(`Datasheets_models_cost: ${costs.length} in export`);
  if (!dryRun) {
    const BATCH = 200;
    for (let i = 0; i < costs.length; i += BATCH) {
      const { error } = await supabase
        .from("Datasheets_models_cost")
        .upsert(costs.slice(i, i + BATCH), { onConflict: "datasheet_id,line" });
      if (error) throw error;
    }
  }

  // ----------------------------
  // Datasheets_keywords
  // ----------------------------
  const keywordRows = parsePipeDelimited(
    path.join(dir, "Datasheets_keywords.csv")
  );
  const keywords = keywordRows
    .filter((r) => exportDatasheetIds.has(r.datasheet_id))
    .map((r) => ({
      datasheet_id: r.datasheet_id,
      keyword: r.keyword,
      model: emptyToNull(r.model),
      is_faction_keyword: parseBool(r.is_faction_keyword),
    }));
  console.log(`Datasheets_keywords: ${keywords.length} in export`);
  if (!dryRun) {
    const BATCH = 200;
    for (let i = 0; i < keywords.length; i += BATCH) {
      const { error } = await supabase
        .from("Datasheets_keywords")
        .upsert(keywords.slice(i, i + BATCH));
      if (error) throw error;
    }
  }

  // ----------------------------
  // Deletions: datasheets in the DB but not in the new export.
  // ----------------------------
  const { data: existingIdsData, error: existingIdsError } = await supabase
    .from("Datasheets")
    .select("id");
  if (existingIdsError) throw existingIdsError;

  const existingIds = (existingIdsData ?? []).map((r) => r.id as string);
  const toRemove = existingIds.filter((id) => !exportDatasheetIds.has(id));
  console.log(`Datasheets in DB but not in export: ${toRemove.length}`);

  if (toRemove.length > 0) {
    const { data: referencedInDaily } = await supabase
      .from("daily_targets")
      .select("unit_id")
      .in("unit_id", toRemove);
    const { data: referencedInRounds } = await supabase
      .from("rounds")
      .select("unit_id")
      .in("unit_id", toRemove);

    const referenced = new Set([
      ...(referencedInDaily ?? []).map((r) => r.unit_id as string),
      ...(referencedInRounds ?? []).map((r) => r.unit_id as string),
    ]);

    const toSoftDelete = toRemove.filter((id) => referenced.has(id));
    const toHardDelete = toRemove.filter((id) => !referenced.has(id));

    console.log(
      `  -> ${toSoftDelete.length} soft-deleted (referenced by past daily/round answers)`
    );
    console.log(`  -> ${toHardDelete.length} hard-deleted`);

    if (!dryRun) {
      if (toSoftDelete.length > 0) {
        const { error } = await supabase
          .from("Datasheets")
          .update({ removed: true })
          .in("id", toSoftDelete);
        if (error) throw error;
      }
      if (toHardDelete.length > 0) {
        // Relies on ON DELETE CASCADE (supabase/05_import_safe_deletes.sql)
        // to clean up Datasheets_models/_models_cost/_keywords rows.
        const { error } = await supabase
          .from("Datasheets")
          .delete()
          .in("id", toHardDelete);
        if (error) throw error;
      }
    }
  }

  console.log(dryRun ? "Dry run complete, no changes applied." : "Refresh complete.");
}

main().catch((err) => {
  console.error("Refresh failed:", err);
  process.exit(1);
});
