import { NextResponse } from "next/server";
import { loadUnits } from "@/app/lib/csv";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").toLowerCase();
  const rawSources = searchParams.get("sources"); // comma-separated ids
  const sources = rawSources ? rawSources.split(',').map(s => s.trim()).filter(Boolean) : undefined;
  const units = await loadUnits(sources);
  const hits = q
    ? units.filter(u => u["Unit Name"].toLowerCase().includes(q)).slice(0, 20)
    : units.slice(0, 20);
  return NextResponse.json(hits.map(u => ({ id: u["Unit ID"], name: u["Unit Name"], faction: u["Faction"] })));
}