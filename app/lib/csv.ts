import { parse } from "csv-parse/sync";
import { UnitRow } from "../types";
import fs from "node:fs";
import path from "node:path";
import getSupabase from "./supabase";

let _cache: UnitRow[] | null = null;

function toNum(x: string | number | undefined | null): number | null {
  if (x === undefined || x === null || x === "") return null;
  // normalize common suffixes/characters used in datasheets:
  // straight quote (") for inches, typographic quotes, and plus signs (e.g. 3+)
  let s = String(x).trim();
  // remove straight and typographic double-quotes and plus signs
  s = s.replace(/[\u0022\u201C\u201D\u2033\+]/g, "");
  // collapse multiple spaces
  s = s.replace(/\s+/g, " ");
  const m = /(-?[0-9]+(?:\.[0-9]+)?)/.exec(s);
  if (!m) return null;
  return Number(m[1]);
}

function rowsToUnits(rows: any[]): UnitRow[] {
  return rows.map((r) => ({
    "Unit ID": String(r["Unit ID"] ?? r.id ?? r.unit_id ?? r["Unit Id"] ?? "").trim(),
    "Unit Name": String(r["Unit Name"] ?? r.name ?? r.unit_name ?? "").trim(),
    "Faction": String(r["Faction"] ?? r.faction ?? "").trim(),
    Movement: toNum(r["Movement"] ?? r.movement),
    Toughness: toNum(r["Toughness"] ?? r.toughness),
    Save: toNum(r["Save"] ?? r.save),
    "Invunl Save": toNum(r["Invunl Save"] ?? r.invunl_save ?? r.invulnerable_save),
    Wounds: toNum(r["Wounds"] ?? r.wounds),
    Leadership: toNum(r["Leadership"] ?? r.leadership),
    OC: toNum(r["OC"] ?? r.oc),
    Points: toNum(r["Points"] ?? r.points),
    "Model Count": Number(r["Model Count"] ?? r.model_count ?? r.count) || (sumNumbersInString(r["Models Cost"] ?? r.models_cost_description ?? r.models_cost ?? r["models cost"] ?? "") || 1),
  }));
}

function sumNumbersInString(s: string | undefined | null): number {
  if (!s) return 0;
  const matches = String(s).match(/\d+/g);
  if (!matches) return 0;
  return matches.map(Number).reduce((a, b) => a + b, 0);
}

function rowsToUnitsFromView(rows: any[]): UnitRow[] {
  return rows.map((r) => ({
    "Unit ID": String(r["unit_id"] ?? r.unit_id ?? r.id ?? "").trim(),
    "Unit Name": String(r["unit_name"] ?? r.unit_name ?? r.name ?? "").trim(),
    "Faction": String(r["faction"] ?? r.faction ?? "").trim(),
    Movement: toNum(r["movement"] ?? r.movement ?? r.m),
    Toughness: toNum(r["toughness"] ?? r.toughness ?? r.t),
    Save: toNum(r["save"] ?? r.save ?? r.sv),
    "Invunl Save": toNum(r["invunl_save"] ?? r.invunl_save ?? r.inv_sv),
    Wounds: toNum(r["wounds"] ?? r.wounds ?? r.w),
    Leadership: toNum(r["leadership"] ?? r.leadership ?? r.ld),
    OC: toNum(r["oc"] ?? r.oc),
    Points: toNum(r["points"] ?? r.points),
    "Model Count": Number(r["model_count"] ?? r.model_count ?? r.line) || 1,
  }));
}

export async function loadUnits(sources?: Array<string | number>): Promise<UnitRow[]> {
  // Only return cached full dataset when no source filter is used
  if (!sources && _cache) return _cache;

  // Try Supabase view first if configured
  const sb = getSupabase();
  if (sb) {
    try {
      let query: any = sb.from("unit_view").select("*");
      if (sources && sources.length) {
        // ensure all values are strings
        const vals = sources.map(s => String(s));
        query = query.in("source_id", vals);
      }
      const { data, error } = await query;
      if (error) throw error;
      const units = rowsToUnitsFromView(data || []);
      if (!sources) _cache = units.filter(u => !!u["Unit Name"]);
      return units.filter(u => !!u["Unit Name"]);
    } catch (err) {
      console.warn("Supabase unit_view fetch failed, falling back to CSV:", err);
    }
  }

  // Fallback to CSV file (local)
  const file = path.join(process.cwd(), "public", "data", "units.csv");
  const raw = fs.readFileSync(file, "utf8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true }) as any[];
  const units = rowsToUnits(rows);
  const filtered = sources && sources.length ? units.filter(u => sources.map(s => String(s)).includes(String((u as any).source_id ?? ''))) : units;
  if (!sources) _cache = filtered.filter(u => !!u["Unit Name"]);
  return filtered.filter(u => !!u["Unit Name"]);
}