import { createClient } from "@/app/lib/supabase/server";
import type { UnitRow } from "@/app/types";

/**
 * Maps a row from the `units` view (snake_case, as defined in
 * supabase/01_schema.sql) to the UnitRow shape the game logic
 * expects. The view already does the "one row per guessable
 * variant" work (see view comments in 01_schema.sql for why that
 * matters), so no client-side expansion/dedup is needed here.
 */
function toUnitRow(row: {
  unit_id: string;
  unit_name: string | null;
  model_line: number;
  movement: string | null;
  toughness: string | null;
  save: string | null;
  invunl_save: string | null;
  wounds: string | null;
  leadership: string | null;
  oc: string | null;
  points: number | null;
  model_count: string | null;
  faction: string | null;
}): UnitRow {
  const toNum = (x: string | null): number | null => {
    if (x == null) return null;
    const m = /(-?\d+(?:\.\d+)?)/.exec(x);
    return m ? Number(m[1]) : null;
  };

  return {
    "Unit ID": row.unit_id,
    "Unit Name": row.unit_name ?? "",
    "Model Line": row.model_line,
    Faction: row.faction ?? "",
    Movement: toNum(row.movement),
    Toughness: toNum(row.toughness),
    Save: toNum(row.save),
    "Invunl Save": toNum(row.invunl_save),
    Wounds: toNum(row.wounds),
    Leadership: toNum(row.leadership),
    OC: toNum(row.oc),
    Points: row.points,
    "Model Count": parseModelCount(row.model_count),
    "Model Count Label": row.model_count ?? "",
  };
}

/**
 * Wahapedia's squad-size field is free text, not a clean integer:
 * "10 models" -> 10, "1 Spanner and 4 Burna Boyz" -> 5 (sum of all
 * numbers found), "Attack Bike" -> null (no number present, e.g.
 * a single named upgrade model). Mirrors the parsing the old
 * client-side csv.ts did, but run once here instead of on every
 * request for every unit.
 */
function parseModelCount(description: string | null): number | null {
  if (!description) return null;
  const numbers = description.match(/\d+/g);
  if (!numbers) return null;
  const total = numbers.reduce((sum, n) => sum + Number(n), 0);
  return total > 0 ? total : null;
}

/**
 * Fetch every guessable unit variant. Used for picking the daily
 * target and for endless mode's random pick -- NOT for search
 * (see searchUnits below, which filters in SQL instead of pulling
 * everything into memory).
 */
export async function getAllUnits(): Promise<UnitRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .select("*")
    .not("unit_name", "is", null)
    .order("unit_id", { ascending: true })
    .order("model_line", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toUnitRow);
}

/**
 * Fetch a single unit variant by its id + model_line. Used to
 * resolve a guess once the client has picked an exact variant_key.
 */
export async function getUnitByVariant(
  unitId: string,
  modelLine: number
): Promise<UnitRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .select("*")
    .eq("unit_id", unitId)
    .eq("model_line", modelLine)
    .maybeSingle();

  if (error) throw error;
  return data ? toUnitRow(data) : null;
}

/**
 * Starts a new round (random target) and returns its id. The
 * target's identity lives only in the `rounds` row server-side;
 * callers get back an opaque id, never the target.
 */
export async function startRound(mode: "endless" | "duel" = "endless"): Promise<string> {
  const units = await getAllUnits();
  if (units.length === 0) {
    throw new Error("No units available to start a round.");
  }
  const target = units[Math.floor(Math.random() * units.length)];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rounds")
    .insert({
      unit_id: target["Unit ID"],
      model_line: target["Model Line"],
      mode,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

/**
 * Fetch the target for an existing round by its id. Used
 * server-side only to judge a guess -- route handlers must never
 * include this function's return value in an HTTP response.
 */
export async function getRoundTarget(roundId: string): Promise<UnitRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rounds")
    .select("unit_id, model_line")
    .eq("id", roundId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return getUnitByVariant(data.unit_id, data.model_line);
}

export type UnitSuggestion = {
  id: string;
  name: string;
  faction: string;
  modelLine: number;
  /** Name of the specific stat-line within the datasheet (e.g. "MAKARI" on the Ghazghkull Thraka sheet). Null when the unit has only one stat-line. */
  modelName: string | null;
  modelCount: number | null;
  modelCountLabel: string;
  points: number | null;
  variantKey: string;
};

/**
 * Search units by name for the guess-input autocomplete. Filters
 * in SQL (ILIKE on a trigram-indexed column -- see 01_schema.sql)
 * rather than loading the whole table into memory, so this stays
 * fast as the dataset grows with 11th-edition updates.
 */
export async function searchUnits(query: string): Promise<UnitSuggestion[]> {
  const q = query.trim();
  if (!q) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .select("*")
    .ilike("unit_name", `%${q}%`)
    .not("unit_name", "is", null)
    .order("unit_name", { ascending: true })
    .limit(20);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.unit_id,
    name: row.unit_name ?? "",
    faction: row.faction ?? "",
    modelLine: row.model_line,
    modelName: row.model_name ?? null,
    modelCount: parseModelCount(row.model_count),
    modelCountLabel: row.model_count ?? "",
    points: row.points,
    variantKey: `${row.unit_id}::${row.model_line}`,
  }));
}

/** Parses a `variant_key` of the form "<unit_id>::<model_line>". */
export function parseVariantKey(
  variantKey: string
): { unitId: string; modelLine: number } | null {
  const [unitId, modelLineRaw] = variantKey.split("::");
  const modelLine = Number(modelLineRaw);
  if (!unitId || !Number.isFinite(modelLine)) return null;
  return { unitId, modelLine };
}
