import { NextResponse } from "next/server";
import { loadUnits } from "@/app/lib/csv";
import { judge } from "@/app/lib/judge";
import { UnitRow } from "@/app/types";

export function GET(req: Request) {
    const units = loadUnits();
    const { searchParams } = new URL(req.url);
    const seed = searchParams.get("seed");

    let idx: number;
    if (seed) {
        // simple deterministic hash (djb2)
        let h = 5381;
        for (let i = 0; i < seed.length; i++) {
            h = ((h << 5) + h) + seed.charCodeAt(i);
            h = h | 0;
        }
        idx = Math.abs(h) % units.length;
    } else {
        idx = Math.floor(Math.random() * units.length);
    }

    const u = units[idx];
    return NextResponse.json({ id: u["Unit ID"], name: u["Unit Name"], faction: u["Faction"], seed: seed || null });
}

export async function POST(req: Request) {
    const body = await req.json();
    const { targetId, name } = body as { targetId?: string; name?: string };
    if (!targetId) return NextResponse.json({ error: "missing targetId" }, { status: 400 });
    const units = loadUnits();
    const target = units.find(u => u["Unit ID"] === String(targetId));
    if (!target) return NextResponse.json({ error: "unknown target" }, { status: 404 });

    // allow guessing by exact name or by id
    const guess = units.find(u => (name && u["Unit Name"].toLowerCase() === String(name).toLowerCase()) || u["Unit ID"] === String(name));
    if (!guess) return NextResponse.json({ error: "Unknown unit" }, { status: 404 });

    const feedback = judge(guess as UnitRow, target as UnitRow);
    const solved = feedback.every(f => f.status === "correct");
    return NextResponse.json({ feedback, solved, guess: { name: guess["Unit Name"], faction: guess["Faction"] } });
}
