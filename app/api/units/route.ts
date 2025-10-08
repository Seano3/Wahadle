import { NextResponse } from "next/server";
import { loadUnits } from "@/app/lib/csv";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const qRaw = (searchParams.get("q") || "").trim();
  const q = qRaw.toLowerCase();
  const units = await loadUnits();

  // Normalize a unit name for matching: remove diacritics, punctuation, collapse spaces
  const normalize = (s?: string) => {
    if (!s) return "";
    return s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // remove diacritics
      .replace(/[^\w\s]/g, " ") // replace punctuation with space
      .replace(/\s+/g, " ")
      .trim();
  };

  const entries = units.map(u => ({ u, norm: normalize(u["Unit Name"]) }));

  // Filter by normalized query if present
  const qNorm = normalize(qRaw);
  let filtered = qNorm ? entries.filter(e => e.norm.includes(qNorm)) : entries;

  // Deduplicate by normalized name + model count key: this allows different
  // datasheet-size variants (e.g. 10-man vs 20-man) to appear separately.
  const best = new Map<string, typeof entries[0]>();
  for (const e of filtered) {
    const modelCountKey = String(e.u["Model Count"] ?? "");
    const factionKey = String(e.u["Faction"] ?? "");
    const key = `${e.norm}||${modelCountKey}||${factionKey}`;
    const existing = best.get(key);
    if (!existing) {
      best.set(key, e);
    } else {
      // If duplicate keys somehow occur, prefer the one with larger model count
      const a = Number(existing.u["Model Count"] ?? 0);
      const b = Number(e.u["Model Count"] ?? 0);
      if (b > a) best.set(key, e);
    }
  }

  let results = Array.from(best.values());

  // Sort by relevance: startsWith matches first, then contains; within group prefer larger model_count
  if (qNorm) {
    results.sort((A, B) => {
      const aStarts = A.norm.startsWith(qNorm) ? 0 : A.norm.includes(qNorm) ? 1 : 2;
      const bStarts = B.norm.startsWith(qNorm) ? 0 : B.norm.includes(qNorm) ? 1 : 2;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return (Number(B.u["Model Count"] ?? 0) - Number(A.u["Model Count"] ?? 0));
    });
  } else {
    results.sort((A, B) => Number(B.u["Model Count"] ?? 0) - Number(A.u["Model Count"] ?? 0));
  }

  results = results.slice(0, 20);

  // Return additional fields so the UI can show stats in the suggestions
  return NextResponse.json(results.map(({ u }) => ({
    id: u["Unit ID"],
    name: u["Unit Name"],
    faction: u["Faction"],
    movement: u.Movement,
    toughness: u.Toughness,
    save: u.Save,
    invunl_save: u["Invunl Save"],
    wounds: u.Wounds,
    leadership: u.Leadership,
    oc: u.OC,
    points: u.Points,
    model_count: u["Model Count"],
    // variant_key combines unit id and model count so the client can identify
    // the exact datasheet variant (e.g. 10-man vs 20-man)
    variant_key: `${u["Unit ID"]}::${u["Model Count"] ?? ""}`,
  })));
}