import { NextResponse } from "next/server";
import { loadUnits } from "@/app/lib/csv";

// Temporary debug endpoint to inspect guess payloads and why a match may be rejected.
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { id, name } = body as { id?: string; name?: string };
        const units = await loadUnits();

        let guess = undefined as any;
        let matchBy = null as null | 'id' | 'name';
        if (id) {
            guess = units.find(u => String(u["Unit ID"]) === String(id));
            if (guess) matchBy = 'id';
        }
        if (!guess && name) {
            guess = units.find(u => u["Unit Name"].toLowerCase() === String(name).toLowerCase());
            if (guess) matchBy = 'name';
        }

        const result: any = { provided: body, found: !!guess, matchBy };
        if (guess) {
            result.matched = {
                id: guess["Unit ID"],
                name: guess["Unit Name"],
                faction: guess["Faction"],
                points: guess.Points ?? guess["Points"] ?? null,
                model_count: guess["Model Count"] ?? null,
            };

            // Check faction
            if (body.faction && String(body.faction) !== String(guess["Faction"])) {
                result.faction_mismatch = { provided: body.faction, actual: guess["Faction"] };
            }

            // Check points (rounded)
            if (body.points !== undefined && body.points !== null) {
                const provided = Number(body.points);
                const actual = Number(guess.Points ?? guess["Points"] ?? 0);
                const providedRounded = Number.isFinite(provided) ? Math.round(provided) : null;
                const actualRounded = Number.isFinite(actual) ? Math.round(actual) : null;
                if (providedRounded !== null && actualRounded !== null && providedRounded !== actualRounded) {
                    result.points_mismatch = { provided: { raw: body.points, rounded: providedRounded }, actual: { raw: actual, rounded: actualRounded } };
                }
            }
        } else {
            // If no guess found, provide some candidate suggestions (by name contains)
            if (name) {
                const norm = String(name).toLowerCase();
                result.candidates = units.filter(u => u["Unit Name"].toLowerCase().includes(norm)).slice(0, 10).map(u => ({ id: u["Unit ID"], name: u["Unit Name"], faction: u["Faction"], points: u.Points ?? u["Points"] ?? null, model_count: u["Model Count"] ?? null }));
            }
        }

        return NextResponse.json(result);
    } catch (err: any) {
        return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
    }
}
