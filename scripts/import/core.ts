import {
  parsePipeDelimited,
  emptyToNull,
  parseBool,
  parseIntOrNull,
} from "./csv";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fetches ALL rows matching a query, paginating past Supabase's
 * default 1000-row-per-request cap (PostgREST applies this
 * regardless of the dashboard's "Max rows" setting in practice --
 * a plain .select() with no .range() silently truncates rather
 * than erroring, so this is easy to miss until a table crosses
 * 1000 rows). This table has 1,634+ datasheets, well past that
 * cap, so every caller that needs "every row" must use this
 * instead of a bare .select().
 */
async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const all: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

export type WahapediaExportFiles = {
  factionsCsv: string;
  sourceCsv: string;
  datasheetsCsv: string;
  modelsCsv: string;
  costCsv: string;
  keywordsCsv: string;
};

/**
 * Fetches the six export files this app needs directly from
 * Wahapedia. Used by both the CLI script (which reads local files
 * after a manual curl) and the admin "Check for updates" button
 * (which fetches over the network at request time) -- this
 * function is the network-fetching variant; the CLI script reads
 * from disk instead (see readLocalExportFiles in refresh.ts).
 *
 * Filenames confirmed against Wahapedia's own Export Data Specs
 * document (Datasheets_models_cost.csv, NOT
 * Datasheets_unit_composition.csv, which is a different table).
 */
export async function fetchExportFiles(
  edition: string
): Promise<WahapediaExportFiles> {
  const base = `https://wahapedia.ru/${edition}`;

  async function fetchCsv(filename: string): Promise<string> {
    const res = await fetch(`${base}/${filename}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${filename}: HTTP ${res.status}`);
    }
    const text = await res.text();
    // A 200 response that's actually an HTML error/redirect page
    // (Wahapedia sometimes serves this instead of a real 404) is
    // worth catching explicitly rather than silently parsing zero
    // useful rows out of it later.
    if (text.trimStart().toLowerCase().startsWith("<!doctype")) {
      throw new Error(
        `${filename} returned an HTML page instead of CSV data -- the file may not exist at this path.`
      );
    }
    return text;
  }

  const [factionsCsv, sourceCsv, datasheetsCsv, modelsCsv, keywordsCsv] =
    await Promise.all([
      fetchCsv("Factions.csv"),
      fetchCsv("Source.csv"),
      fetchCsv("Datasheets.csv"),
      fetchCsv("Datasheets_models.csv"),
      fetchCsv("Datasheets_keywords.csv"),
    ]);

  // Cost file: try the confirmed name first, then fall back.
  let costCsv: string;
  try {
    costCsv = await fetchCsv("Datasheets_models_cost.csv");
  } catch {
    costCsv = await fetchCsv("Datasheets_unit_composition.csv");
  }

  return { factionsCsv, sourceCsv, datasheetsCsv, modelsCsv, costCsv, keywordsCsv };
}

function parseCsvText(text: string): Record<string, string>[] {
  // Same parsing rules as parsePipeDelimited, but operating on an
  // in-memory string (from fetch) rather than a file path (from
  // the CLI's local download). Re-implemented rather than shared
  // with csv.ts's file-based version to avoid threading a string-
  // vs-path union through every call site.
  const stripped = text.replace(/^\uFEFF/, "");
  const lines = stripped.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split("|").map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split("|");
    const row: Record<string, string> = {};
    header.forEach((col, idx) => {
      row[col] = fields[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

export type ParsedExport = {
  factions: { id: string; name: string; link: string | null }[];
  sources: {
    id: string;
    name: string;
    type: string | null;
    edition: string | null;
    version: string | null;
    errata_date: string | null;
    errata_link: string | null;
    is_legends: boolean;
  }[];
  datasheets: {
    id: string;
    name: string | null;
    faction_id: string | null;
    source_id: string | null;
    legend: string | null;
    role: string | null;
    loadout: string | null;
    transport: string | null;
    virtual: boolean;
    leader_head: string | null;
    leader_footer: string | null;
    damaged_w: string | null;
    damaged_description: string | null;
    link: string | null;
    removed: boolean;
  }[];
  models: {
    datasheet_id: string;
    line: number;
    name: string | null;
    M: string | null;
    T: string | null;
    Sv: string | null;
    inv_sv: string | null;
    inv_sv_descr: string | null;
    W: string | null;
    Ld: string | null;
    OC: string | null;
    base_size: string | null;
    base_size_descr: string | null;
  }[];
  costs: {
    datasheet_id: string;
    line: number;
    description: string | null;
    cost: number | null;
  }[];
  keywords: {
    datasheet_id: string;
    keyword: string;
    model: string | null;
    is_faction_keyword: boolean;
  }[];
};

/** Parses raw export file text into typed, schema-shaped rows. */
export function parseExport(files: WahapediaExportFiles): ParsedExport {
  const factions = parseCsvText(files.factionsCsv).map((r) => ({
    id: r.id.trim(),
    name: r.name,
    link: emptyToNull(r.link),
  }));

  const sources = parseCsvText(files.sourceCsv).map((r) => {
    const name = r.name ?? "";
    const isLegends =
      name.toLowerCase().includes("legends") ||
      name.toLowerCase().startsWith("black library");
    return {
      id: r.id.trim(),
      name,
      type: emptyToNull(r.type),
      edition: emptyToNull(r.edition),
      version: emptyToNull(r.version),
      errata_date: emptyToNull(r.errata_date),
      errata_link: emptyToNull(r.errata_link),
      is_legends: isLegends,
    };
  });

  const datasheets = parseCsvText(files.datasheetsCsv).map((r) => ({
    id: r.id.trim(),
    name: emptyToNull(r.name),
    faction_id: emptyToNull(r.faction_id?.trim()),
    source_id: emptyToNull(r.source_id?.trim()),
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

  const datasheetIds = new Set(datasheets.map((d) => d.id));

  const models = parseCsvText(files.modelsCsv)
    .filter((r) => datasheetIds.has(r.datasheet_id.trim()))
    .map((r) => ({
      datasheet_id: r.datasheet_id.trim(),
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

  const costs = parseCsvText(files.costCsv)
    .filter((r) => datasheetIds.has(r.datasheet_id.trim()))
    .map((r) => ({
      datasheet_id: r.datasheet_id.trim(),
      line: parseIntOrNull(r.line) ?? 0,
      description: emptyToNull(r.description),
      cost: parseIntOrNull(r.cost),
    }));

  const keywords = parseCsvText(files.keywordsCsv)
    .filter((r) => datasheetIds.has(r.datasheet_id.trim()))
    .map((r) => ({
      datasheet_id: r.datasheet_id.trim(),
      keyword: r.keyword,
      model: emptyToNull(r.model),
      is_faction_keyword: parseBool(r.is_faction_keyword),
    }));

  return { factions, sources, datasheets, models, costs, keywords };
}

export type DatasheetDiffEntry = {
  id: string;
  name: string | null;
  faction_id: string | null;
};

export type ImportDiff = {
  counts: {
    factions: number;
    sources: number;
    datasheets: number;
    models: number;
    costs: number;
    keywords: number;
  };
  newDatasheets: DatasheetDiffEntry[];
  changedDatasheets: DatasheetDiffEntry[];
  softDeletedDatasheets: DatasheetDiffEntry[];
  hardDeletedDatasheets: DatasheetDiffEntry[];
};

/**
 * Computes what a refresh WOULD do, without writing anything.
 * This is what the admin "Check for updates" preview screen
 * renders, and what the CLI script's --dry-run prints.
 *
 * "New"/"changed" counts exclude Legends-sourced datasheets --
 * those get upserted into the database the same as anything else
 * (so the admin editor can still see/fix them, and so a unit that
 * moves OUT of Legends in a future Wahapedia update is already
 * there to pick up), but they're never playable (the `units` view
 * filters them out via Source.is_legends) and showing "412 new
 * datasheets!" when 400 of them are unplayable Legends entries
 * would be a misleading preview.
 */
export async function computeDiff(
  supabase: SupabaseClient,
  parsed: ParsedExport
): Promise<ImportDiff> {
  const exportIds = new Set(parsed.datasheets.map((d) => d.id));

  const legendsSourceIds = new Set(
    parsed.sources.filter((s) => s.is_legends).map((s) => s.id)
  );
  const isLegendsDatasheet = (sourceId: string | null) =>
    sourceId !== null && legendsSourceIds.has(sourceId);

  const existingRows = await fetchAllRows<{
    id: string;
    name: string | null;
    faction_id: string | null;
  }>(supabase, "Datasheets", "id, name, faction_id");

  const existingById = new Map(existingRows.map((r) => [r.id, r]));

  const newDatasheets: DatasheetDiffEntry[] = [];
  const changedDatasheets: DatasheetDiffEntry[] = [];

  for (const d of parsed.datasheets) {
    if (isLegendsDatasheet(d.source_id)) continue;

    const existing = existingById.get(d.id);
    if (!existing) {
      newDatasheets.push({ id: d.id, name: d.name, faction_id: d.faction_id });
    } else if (existing.name !== d.name || existing.faction_id !== d.faction_id) {
      // Name/faction changes are the cheapest meaningful "did this
      // change" signal to surface in a preview without diffing
      // every column of every child table. A full per-field diff
      // would be more thorough but is overkill for "should I trust
      // this refresh" -- the actual upsert still applies all
      // fields regardless of what's shown here.
      changedDatasheets.push({ id: d.id, name: d.name, faction_id: d.faction_id });
    }
  }

  const existingIds = new Set(existingById.keys());
  const toRemove = [...existingIds].filter((id) => !exportIds.has(id));

  let softDeletedDatasheets: DatasheetDiffEntry[] = [];
  let hardDeletedDatasheets: DatasheetDiffEntry[] = [];

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
      ...(referencedInDaily ?? []).map((r: any) => r.unit_id as string),
      ...(referencedInRounds ?? []).map((r: any) => r.unit_id as string),
    ]);

    softDeletedDatasheets = toRemove
      .filter((id) => referenced.has(id))
      .map((id) => {
        const existing = existingById.get(id);
        return { id, name: existing?.name ?? null, faction_id: existing?.faction_id ?? null };
      });
    hardDeletedDatasheets = toRemove
      .filter((id) => !referenced.has(id))
      .map((id) => {
        const existing = existingById.get(id);
        return { id, name: existing?.name ?? null, faction_id: existing?.faction_id ?? null };
      });
  }

  return {
    counts: {
      factions: parsed.factions.length,
      sources: parsed.sources.length,
      datasheets: parsed.datasheets.length,
      models: parsed.models.length,
      costs: parsed.costs.length,
      keywords: parsed.keywords.length,
    },
    newDatasheets,
    changedDatasheets,
    softDeletedDatasheets,
    hardDeletedDatasheets,
  };
}

const BATCH_SIZE = 200;

/**
 * Returns rows with duplicate conflict-key collisions removed
 * (keeping the LAST occurrence of each key), plus how many were
 * dropped. Postgres's ON CONFLICT DO UPDATE rejects a batch
 * outright if it contains two rows with the same key -- "ON
 * CONFLICT DO UPDATE command cannot affect row a second time" --
 * which happens if Wahapedia's export itself has a duplicate row
 * for some (datasheet_id, line) or id. This has actually occurred
 * in practice (see the comment where this is called from
 * applyImport) -- it's a real data-quality issue on Wahapedia's
 * side, not just defensive code, so dedup counts are logged
 * rather than silently discarded.
 */
function dedupeByKey<T extends Record<string, any>>(
  rows: T[],
  keyFields: string[]
): { deduped: T[]; droppedCount: number; droppedKeys: string[] } {
  const seen = new Map<string, T>();
  const droppedKeys: string[] = [];

  for (const row of rows) {
    const key = keyFields.map((f) => String(row[f])).join("::");
    if (seen.has(key)) {
      droppedKeys.push(key);
    }
    // Keep the LAST occurrence -- if Wahapedia's export somehow
    // lists the same key twice with different data, the later row
    // in file order is the more likely "actual current" value.
    seen.set(key, row);
  }

  return {
    deduped: [...seen.values()],
    droppedCount: droppedKeys.length,
    droppedKeys,
  };
}

async function upsertInBatches(
  supabase: SupabaseClient,
  table: string,
  rows: any[],
  onConflict?: string
) {
  // Datasheets_keywords has no `id` column at all -- its real
  // primary key is (datasheet_id, keyword, model_key), where
  // model_key is a generated column (see 01_schema.sql) that
  // can't be targeted by an upsert's onConflict directly. Using
  // the wrong default key here previously meant every keyword row
  // deduped against the same (nonexistent) `id` field and silently
  // collapsed down to a single row -- a worse bug than the
  // duplicate-row error this function exists to catch. Dedup on
  // the table's actual natural key instead; onConflict is still
  // omitted from the upsert call itself, matching the table's
  // real primary key.
  const keyFields =
    onConflict?.split(",") ??
    (table === "Datasheets_keywords"
      ? ["datasheet_id", "keyword", "model"]
      : ["id"]);

  const { deduped, droppedCount, droppedKeys } = dedupeByKey(rows, keyFields);

  if (droppedCount > 0) {
    console.warn(
      `${table}: dropped ${droppedCount} duplicate row(s) from the Wahapedia export ` +
        `(duplicate key on ${keyFields.join(",")}): ${droppedKeys.slice(0, 10).join(", ")}` +
        (droppedKeys.length > 10 ? ", ..." : "")
    );
  }

  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const batch = deduped.slice(i, i + BATCH_SIZE);
    const { error } = onConflict
      ? await supabase.from(table).upsert(batch, { onConflict })
      : await supabase.from(table).upsert(batch);

    if (error) {
      // Dedup should have made this impossible -- if it still
      // happens, something about this table's real key differs
      // from what we assumed. Identify the actual colliding
      // row(s) within this specific batch so the error is
      // actionable instead of a generic Postgres message.
      //
      // Throws a NEW error with the diagnostic baked into its
      // message, rather than just logging and re-throwing the
      // original -- a plain console.error here is easy to miss
      // (it can scroll out of view behind other request logs
      // before anyone reads it), whereas the message on a thrown
      // Error flows straight through to the API route's error
      // response and renders in the admin page's error banner.
      if (error.code === "21000") {
        const seenInBatch = new Map<string, number>();
        const collisions: { key: string; rows: any[] }[] = [];
        batch.forEach((row, idx) => {
          const key = keyFields.map((f) => String(row[f])).join("::");
          if (seenInBatch.has(key)) {
            collisions.push({
              key,
              rows: [batch[seenInBatch.get(key)!], row],
            });
          }
          seenInBatch.set(key, idx);
        });

        // Full row detail goes to the server log (useful for
        // actually fixing the root cause -- e.g. seeing exactly
        // what differs between the two colliding rows), while a
        // short summary goes into the thrown error's message so
        // it's visible in the admin page's error banner without
        // needing to go dig through logs at all.
        if (collisions.length > 0) {
          console.error(
            `${table}: colliding rows for key "${collisions[0].key}":`,
            JSON.stringify(collisions[0].rows, null, 2)
          );
        }

        const diagnostic =
          collisions.length > 0
            ? `duplicate key "${collisions[0].key}" appears ${collisions.length + 1} time(s) in this batch (dedup key: ${keyFields.join(",")})`
            : `no collision found under the assumed key (${keyFields.join(",")}) -- ` +
              `this table's real conflict target is probably different from what's assumed here, ` +
              `check the table's actual primary key in 01_schema.sql`;

        throw new Error(
          `${table}: upsert rejected by Postgres (batch rows ${i}-${i + batch.length}). ${diagnostic}. ` +
            `Original error: ${error.message}`
        );
      }
      throw error;
    }
  }
}

/**
 * Actually applies a refresh: upserts everything, then deletes
 * (soft or hard) datasheets missing from the export. Re-derives
 * the set of datasheets to remove at apply-time rather than
 * trusting a previously-computed diff passed in from the caller,
 * since this performs real writes -- if something changed on
 * Wahapedia's end or in the database between a preview and this
 * call, applying against fresh data is safer than applying a
 * stale plan.
 */
export async function applyImport(
  supabase: SupabaseClient,
  parsed: ParsedExport
): Promise<void> {
  await upsertInBatches(supabase, "Factions", parsed.factions);
  await upsertInBatches(supabase, "Source", parsed.sources);
  await upsertInBatches(supabase, "Datasheets", parsed.datasheets);
  await upsertInBatches(supabase, "Datasheets_models", parsed.models, "datasheet_id,line");
  await upsertInBatches(supabase, "Datasheets_models_cost", parsed.costs, "datasheet_id,line");
  await upsertInBatches(supabase, "Datasheets_keywords", parsed.keywords);

  const exportIds = new Set(parsed.datasheets.map((d) => d.id));
  const existingIdRows = await fetchAllRows<{ id: string }>(
    supabase,
    "Datasheets",
    "id"
  );
  const existingIds = existingIdRows.map((r) => r.id);
  const toRemove = existingIds.filter((id) => !exportIds.has(id));

  if (toRemove.length === 0) return;

  const { data: referencedInDaily } = await supabase
    .from("daily_targets")
    .select("unit_id")
    .in("unit_id", toRemove);
  const { data: referencedInRounds } = await supabase
    .from("rounds")
    .select("unit_id")
    .in("unit_id", toRemove);

  const referenced = new Set([
    ...(referencedInDaily ?? []).map((r: any) => r.unit_id as string),
    ...(referencedInRounds ?? []).map((r: any) => r.unit_id as string),
  ]);

  const toSoftDelete = toRemove.filter((id) => referenced.has(id));
  const toHardDelete = toRemove.filter((id) => !referenced.has(id));

  if (toSoftDelete.length > 0) {
    const { error } = await supabase
      .from("Datasheets")
      .update({ removed: true })
      .in("id", toSoftDelete);
    if (error) throw error;
  }
  if (toHardDelete.length > 0) {
    const { error } = await supabase.from("Datasheets").delete().in("id", toHardDelete);
    if (error) throw error;
  }
}
