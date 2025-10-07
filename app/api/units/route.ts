import { NextResponse } from "next/server";
import { loadUnits } from "@/app/lib/csv";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").toLowerCase();
  const units = await loadUnits();
  const hits = q
    ? units.filter(u => u["Unit Name"].toLowerCase().includes(q)).slice(0, 20)
    : units.slice(0, 20);
  return NextResponse.json(hits.map(u => ({ id: u["Unit ID"], name: u["Unit Name"], faction: u["Faction"] })));
}