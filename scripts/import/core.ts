import {
  parsePipeDelimited,
  emptyToNull,
  parseBool,
  parseIntOrNull,
} from "./csv";
import type { SupabaseClient } from "@supabase/supabase-js";

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
    id: r.id,
    name: r.name,
    link: emptyToNull(r.link),
  }));

  const sources = parseCsvText(files.sourceCsv).map((r) => {
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
  });

  const datasheets = parseCsvText(files.datasheetsCsv).map((r) => ({
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

  const datasheetIds = new Set(datasheets.map((d) => d.id));

  const models = parseCsvText(files.modelsCsv)
    .filter((r) => datasheetIds.has(r.datasheet_id))
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

  const costs = parseCsvText(files.costCsv)
    .filter((r) => datasheetIds.has(r.datasheet_id))
    .map((r) => ({
      datasheet_id: r.datasheet_id,
      line: parseIntOrNull(r.line) ?? 0,
      description: emptyToNull(r.description),
      cost: parseIntOrNull(r.cost),
    }));

  const keywords = parseCsvText(files.keywordsCsv)
    .filter((r) => datasheetIds.has(r.datasheet_id))
    .map((r) => ({
      datasheet_id: r.datasheet_id,
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
 */
export async function computeDiff(
  supabase: SupabaseClient,
  parsed: ParsedExport
): Promise<ImportDiff> {
  const exportIds = new Set(parsed.datasheets.map((d) => d.id));

  const { data: existingRows, error: existingError } = await supabase
    .from("Datasheets")
    .select("id, name, faction_id");
  if (existingError) throw existingError;

  const existingById = new Map(
    (existingRows ?? []).map((r: any) => [r.id as string, r])
  );

  const newDatasheets: DatasheetDiffEntry[] = [];
  const changedDatasheets: DatasheetDiffEntry[] = [];

  for (const d of parsed.datasheets) {
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

async function upsertInBatches(
  supabase: SupabaseClient,
  table: string,
  rows: any[],
  onConflict?: string
) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = onConflict
      ? await supabase.from(table).upsert(batch, { onConflict })
      : await supabase.from(table).upsert(batch);
    if (error) throw error;
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
  const { data: existingIdsData, error: existingIdsError } = await supabase
    .from("Datasheets")
    .select("id");
  if (existingIdsError) throw existingIdsError;

  const existingIds = (existingIdsData ?? []).map((r: any) => r.id as string);
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
