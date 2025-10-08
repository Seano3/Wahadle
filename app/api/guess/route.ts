import { NextResponse } from "next/server";
import { loadUnits } from "@/app/lib/csv";
import { getDailyUnit } from "@/app/lib/daily";
import { Feedback, UnitRow } from "@/app/types";
import { judge } from "@/app/lib/judge";

// judge and FIELDS are provided by app/lib/judge.ts

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, name } = body as { id?: string; name?: string };
    const units = await loadUnits();
    const target = await getDailyUnit();

    // Prefer exact variant_key match if provided (id::model_count), then id, then name
    let guess: UnitRow | undefined;
    if (body.variant_key) {
      const [vid, vmodel] = String(body.variant_key).split("::");
      guess = units.find(u => String(u["Unit ID"]) === String(vid) && String(u["Model Count"] ?? "") === String(vmodel ?? ""));
    }
    if (!guess && id) {
      guess = units.find(u => String(u["Unit ID"]) === String(id));
    }
    if (!guess && name) {
      guess = units.find(u => u["Unit Name"].toLowerCase() === String(name).toLowerCase());
    }
    // If the client provided faction/points, verify they match the chosen unit to avoid mixups
    if (guess) {
      if (body.faction && String(body.faction) !== String(guess["Faction"])) {
        console.warn('Faction mismatch for id', id, 'provided:', body.faction, 'actual:', guess["Faction"]);
        return NextResponse.json({ error: "Faction does not match selected unit", provided: { faction: body.faction }, actual: { faction: guess["Faction"] } }, { status: 400 });
      }
      if (body.points !== undefined && body.points !== null) {
        const providedRaw = body.points;
        const provided = Number(providedRaw);
        const actual = Number(guess.Points ?? guess["Points"] ?? 0);
        // Compare rounded integers to avoid minor formatting/float differences
        const providedRounded = Number.isFinite(provided) ? Math.round(provided) : null;
        const actualRounded = Number.isFinite(actual) ? Math.round(actual) : null;
        if (providedRounded !== null && actualRounded !== null && providedRounded !== actualRounded) {
          console.warn('Points mismatch for id', id, 'provided:', providedRaw, 'actual:', actual);
          return NextResponse.json({ error: "Points do not match selected unit", provided: { points: providedRaw, points_rounded: providedRounded }, actual: { points: actual, points_rounded: actualRounded } }, { status: 400 });
        }
      }
    }
    if (!guess) return NextResponse.json({ error: "Unknown unit" }, { status: 404 });
    const feedback = judge(guess, target);
    const solved = feedback.every(f => f.status === "correct");
    return NextResponse.json({ feedback, solved, guess: { name: guess["Unit Name"], faction: guess["Faction"] } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}