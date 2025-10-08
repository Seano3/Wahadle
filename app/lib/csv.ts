import { parse } from "csv-parse/sync";
import { UnitRow } from "../types";
import fs from "node:fs";
import path from "node:path";
import { createClient } from '@supabase/supabase-js'

let _cache: UnitRow[] | null = null;

function toNum(x: string | undefined): number | null {
  if (!x) return null;
  const m = /([0-9]+(?:\.[0-9]+)?)/.exec(x);
  if (!m) return null;
  return Number(m[1]);
}

export async function loadUnits(): Promise<UnitRow[]> {
  if (_cache) return _cache;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const res = await supabase.functions.invoke('unti-view', {
    body: { name: 'Functions' },
  })

  if (res.error) {
    console.error('Error getting units:', res.error)
    throw res.error
  }

  // The invoked Edge function returns an object like { data: [...] }
  // so the payload may be nested under res.data.data or directly res.data.
  const payload = (res.data && (res.data as any).data) ?? res.data ?? null

  let units: UnitRow[] = [];
  const rowsArray = Array.isArray(payload) ? payload : (Array.isArray((payload as any)?.data) ? (payload as any).data : null)
  if (rowsArray) {
    // helper to coerce numbers from strings or numbers
    const toNumAny = (x: any): number | null => {
      if (x === null || x === undefined) return null
      if (typeof x === 'number') return x
      return toNum(String(x))
    }

    const parseModelCountAny = (v: any): number | null => {
      if (v === null || v === undefined) return null
      if (typeof v === 'number') return v
      if (typeof v === 'string') {
        const words = v.split(' ')
        const numbers = words.map(w => parseInt(w)).filter(n => !isNaN(n))
        const total = numbers.reduce((a, b) => a + b, 0)
        if (total > 0) return total
      }
      return null
    }

    // Expand aggregated units: return one UnitRow per model variant so different
    // datasheet-model combinations (like Cadian Shock Troops 10-model / 20-model)
    // appear as separate rows in the search index.
    const expanded: UnitRow[] = []
    for (const r of (rowsArray as any[])) {
      const unitId = String(r["unit_id"] ?? r["unitId"] ?? r.id ?? '').trim()
      const unitName = String(r["unit_name"] ?? r["unitName"] ?? r.name ?? '').trim()
      const faction = String(r["faction"] ?? '').trim()

      const models = Array.isArray(r.models) && r.models.length > 0 ? r.models : [r]

      for (const m of models) {
        const modelCount = parseModelCountAny(m?.model_count ?? m?.Model_Count ?? r?.model_count ?? r?.Model_Count ?? null) ?? 1
        const row: UnitRow = {
          "Unit ID": unitId,
          "Unit Name": unitName,
          "Faction": faction,
          Movement: toNumAny(m?.movement ?? m?.M ?? r?.movement ?? r?.M ?? null),
          Toughness: toNumAny(m?.toughness ?? m?.T ?? r?.toughness ?? r?.T ?? null),
          Save: toNumAny(m?.save ?? m?.Sv ?? r?.save ?? r?.Sv ?? null),
          "Invunl Save": toNumAny(m?.invunl_save ?? m?.inv_sv ?? r?.invunl_save ?? r?.inv_sv ?? null),
          Wounds: toNumAny(m?.wounds ?? m?.W ?? r?.wounds ?? r?.W ?? null),
          Leadership: toNumAny(m?.leadership ?? m?.Ld ?? r?.leadership ?? r?.Ld ?? null),
          OC: toNumAny(m?.oc ?? m?.OC ?? r?.oc ?? r?.OC ?? null),
          Points: toNumAny(m?.points ?? m?.cost ?? r?.points ?? r?.cost ?? r?.total_points ?? null),
          "Model Count": modelCount,
        }
        expanded.push(row)
      }
    }
    units = expanded
  }

  // const file = path.join(process.cwd(), "public", "data", "units.csv");
  // const raw = fs.readFileSync(file, "utf8");
  // const rows = parse(raw, { columns: true, skip_empty_lines: true }) as any[];
  // const units: UnitRow[] = rows.map((r) => ({
  //   "Unit ID": String(r["Unit ID"]).trim(),
  //   "Unit Name": String(r["Unit Name"]).trim(),
  //   "Faction": String(r["Faction"]).trim(),
  //   Movement: toNum(r["Movement"]),
  //   Toughness: toNum(r["Toughness"]),
  //   Save: toNum(r["Save"]),
  //   "Invunl Save": toNum(r["Invunl Save"]),
  //   Wounds: toNum(r["Wounds"]),
  //   Leadership: toNum(r["Leadership"]),
  //   OC: toNum(r["OC"]),
  //   Points: toNum(r["Points"]),
  //   "Model Count": Number(r["Model Count"]) || 1,
  //}));

  _cache = units.filter(u => !!u["Unit Name"]);
  return _cache;
}