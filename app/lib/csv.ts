import { parse } from "csv-parse/sync";
import { UnitRow } from "../types";
import fs from "node:fs";
import path from "node:path";

let _cache: UnitRow[] | null = null;

function toNum(x: string | undefined): number | null {
  if (!x) return null;
  const m = /([0-9]+(?:\.[0-9]+)?)/.exec(x);
  if (!m) return null;
  return Number(m[1]);
}

export function loadUnits(): UnitRow[] {
  if (_cache) return _cache;
  const file = path.join(process.cwd(), "public", "data", "units.csv");
  const raw = fs.readFileSync(file, "utf8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true }) as any[];
  const units: UnitRow[] = rows.map((r) => ({
    "Unit ID": String(r["Unit ID"]).trim(),
    "Unit Name": String(r["Unit Name"]).trim(),
    "Faction ID": String(r["Faction ID"]).trim(),
    Movement: toNum(r["Movement"]),
    Toughness: toNum(r["Toughness"]),
    Save: toNum(r["Save"]),
    "Invunl Save": toNum(r["Invunl Save"]),
    Wounds: toNum(r["Wounds"]),
    Leadership: toNum(r["Leadership"]),
    OC: toNum(r["OC"]),
    Points: toNum(r["Points"]),
    "Model Count": Number(r["Model Count"]) || 1,
    Legends: (r["Legends"] ?? "").toString().trim() || null,
  }));
  _cache = units.filter(u => !!u["Unit Name"]);
  return _cache;
}