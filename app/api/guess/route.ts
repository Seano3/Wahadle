import { NextResponse } from "next/server";
import { loadUnits } from "@/app/lib/csv";
import { getDailyUnit } from "@/app/lib/daily";
import { Feedback, StatKey, UnitRow } from "@/app/types";

const FIELDS: StatKey[] = [
  "Movement","Toughness","Save","Invunl Save","Wounds","Leadership","OC","Points","Model Count","Faction ID","Legends"
];

function compareNumeric(a: number | null, b: number | null): "correct"|"higher"|"lower"|"mismatch" {
  if (a == null || b == null) return "mismatch";
  if (a === b) return "correct";
  return a > b ? "higher" : "lower";
}

function judge(guess: UnitRow, target: UnitRow): Feedback[] {
  return FIELDS.map((f) => {
    if (f === "Faction ID") {
      return { field: f, status: guess["Faction ID"] === target["Faction ID"] ? "correct" : "mismatch" };
    }
    if (f === "Legends") {
      const g = (guess.Legends ?? "No").toLowerCase();
      const t = (target.Legends ?? "No").toLowerCase();
      return { field: f, status: g === t ? "correct" : "mismatch" };
    }
    const status = compareNumeric(guess[f] as any, target[f] as any);
    return { field: f, status };
  });
}

export async function POST(req: Request) {
  const { name } = await req.json();
  const units = loadUnits();
  const target = getDailyUnit();
  const guess = units.find(u => u["Unit Name"].toLowerCase() === String(name).toLowerCase());
  if (!guess) return NextResponse.json({ error: "Unknown unit" }, { status: 404 });
  const feedback = judge(guess, target);
  const solved = feedback.every(f => f.status === "correct");
  return NextResponse.json({ feedback, solved, guess: { name: guess["Unit Name"], faction: guess["Faction ID"] } });
}