import { NextResponse } from "next/server";
import { loadUnits } from "@/app/lib/csv";
import { getDailyUnit } from "@/app/lib/daily";
import { Feedback, UnitRow } from "@/app/types";
import { judge } from "@/app/lib/judge";

// judge and FIELDS are provided by app/lib/judge.ts

export async function POST(req: Request) {
  try {
    const { name } = await req.json();
    const units = await loadUnits();
    const target = await getDailyUnit();
    const guess = units.find(u => u["Unit Name"].toLowerCase() === String(name).toLowerCase());
    if (!guess) return NextResponse.json({ error: "Unknown unit" }, { status: 404 });
    const feedback = judge(guess, target);
    const solved = feedback.every(f => f.status === "correct");
    return NextResponse.json({ feedback, solved, guess: { name: guess["Unit Name"], faction: guess["Faction"] } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}