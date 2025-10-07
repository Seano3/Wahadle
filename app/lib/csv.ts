import { parse } from "csv-parse/sync";
import { UnitRow } from "../types";
import fs from "node:fs";
import path from "node:path";
import getSupabase from "./supabase";

let _cache: UnitRow[] | null = null;

function toNum(x: string | number | undefined | null): number | null {
  if (x === undefined || x === null || x === "") return null;
  const s = String(x);
  const m = /([0-9]+(?:\.[0-9]+)?)/.exec(s);
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
    "Model Count": Number(r["Model Count"] ?? r.model_count ?? r.count) || 1,
  }));
}

export async function loadUnits(): Promise<UnitRow[]> {
  if (_cache) return _cache;

  // Try Supabase first if configured
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.from("units").select("*");
      if (error) throw error;
      const units = rowsToUnits(data || []);
      _cache = units.filter(u => !!u["Unit Name"]);
      return _cache;
    } catch (err) {
      console.warn("Supabase units fetch failed, falling back to CSV:", err);
    }
  }

  // Fallback to CSV file (local)
  const file = path.join(process.cwd(), "public", "data", "units.csv");
  const raw = fs.readFileSync(file, "utf8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true }) as any[];
  const units = rowsToUnits(rows);
  _cache = units.filter(u => !!u["Unit Name"]);
  return _cache;
}