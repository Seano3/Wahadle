import { NextResponse } from "next/server";
import { loadUnits } from "@/app/lib/csv";

export function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").toLowerCase();
  const units = loadUnits();
  const hits = q
    ? units.filter(u => u["Unit Name"].toLowerCase().includes(q)).slice(0, 20)
    : units.slice(0, 20);

  // Return additional fields so the UI can show stats in the suggestions
  return NextResponse.json(hits.map(u => ({
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
  })));
}