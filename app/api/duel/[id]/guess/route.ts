import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";
import { createServiceRoleClient } from "@/app/lib/supabase/serviceRole";
import { getUnitByVariant, parseVariantKey } from "@/app/lib/units";
import { judge } from "@/app/lib/judge";
import { computeCurrentRound } from "@/app/lib/duelHelpers";

export const dynamic = "force-dynamic";

async function checkAndFinalizeRound(
  srv: ReturnType<typeof createServiceRoleClient>,
  duelId: string,
  roundNumber: number,
  challengerId: string,
  challengedId: string
) {
  const { data: playerRounds } = await srv
    .from("duel_player_rounds")
    .select("user_id, completed_at, score")
    .eq("duel_id", duelId)
    .eq("round_number", roundNumber);

  const rows = playerRounds ?? [];
  const cDone = rows.find((r) => r.user_id === challengerId && r.completed_at);
  const dDone = rows.find((r) => r.user_id === challengedId && r.completed_at);

  if (cDone && dDone && roundNumber === 5) {
    // Last round complete — tally final scores and mark duel completed
    const { data: allRounds } = await srv
      .from("duel_player_rounds")
      .select("user_id, score")
      .eq("duel_id", duelId);

    const all = allRounds ?? [];
    const cTotal = all.filter((r) => r.user_id === challengerId).reduce((s, r) => s + (r.score ?? 0), 0);
    const dTotal = all.filter((r) => r.user_id === challengedId).reduce((s, r) => s + (r.score ?? 0), 0);

    const winnerId = cTotal > dTotal ? challengerId : dTotal > cTotal ? challengedId : null;

    await srv.from("duels").update({ status: "completed", winner_id: winnerId }).eq("id", duelId);
  }
}

// POST /api/duel/[id]/guess
// Body: { variantKey: string, roundNumber: string }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { variantKey, roundNumber: roundNumberRaw } = body;
    const roundNumber = parseInt(roundNumberRaw, 10);

    if (!variantKey || !Number.isFinite(roundNumber)) {
      return NextResponse.json({ error: "Missing variantKey or roundNumber." }, { status: 400 });
    }

    const srv = createServiceRoleClient();

    const { data: duel } = await srv.from("duels").select("*").eq("id", id).maybeSingle();
    if (!duel) return NextResponse.json({ error: "Duel not found." }, { status: 404 });
    if (duel.challenger_id !== user.id && duel.challenged_id !== user.id) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (duel.status !== "active") {
      return NextResponse.json({ error: "Duel is not active." }, { status: 409 });
    }

    const { data: playerRoundsRaw } = await srv
      .from("duel_player_rounds")
      .select("*")
      .eq("duel_id", id);

    const playerRounds = playerRoundsRaw ?? [];
    const opponentId =
      user.id === duel.challenger_id ? duel.challenged_id : duel.challenger_id;

    const currentRound = computeCurrentRound(playerRounds, duel.challenger_id, duel.challenged_id);

    if (roundNumber !== currentRound) {
      return NextResponse.json({ error: "Round mismatch — please refresh." }, { status: 409 });
    }

    const myCurrentRow = playerRounds.find(
      (p) => p.round_number === currentRound && p.user_id === user.id
    );
    if (myCurrentRow?.completed_at) {
      return NextResponse.json({ error: "You've already completed this round." }, { status: 409 });
    }

    // Resolve the guess
    const parsed = parseVariantKey(variantKey);
    if (!parsed) return NextResponse.json({ error: "Malformed variantKey." }, { status: 400 });

    const guessUnit = await getUnitByVariant(parsed.unitId, parsed.modelLine);
    if (!guessUnit) return NextResponse.json({ error: "Unknown unit." }, { status: 404 });

    // Get the target for this round
    const { data: duelRound } = await srv
      .from("duel_rounds")
      .select("unit_id, model_line")
      .eq("duel_id", id)
      .eq("round_number", currentRound)
      .maybeSingle();

    if (!duelRound) return NextResponse.json({ error: "Round target not found." }, { status: 500 });

    const targetUnit = await getUnitByVariant(duelRound.unit_id, duelRound.model_line);
    if (!targetUnit) return NextResponse.json({ error: "Round target unit missing." }, { status: 500 });

    const feedback = judge(guessUnit, targetUnit);
    const solved = feedback.every((f) => f.status === "correct");

    // Determine position
    const { data: existingGuesses } = await srv
      .from("duel_guesses")
      .select("id")
      .eq("duel_id", id)
      .eq("round_number", currentRound)
      .eq("user_id", user.id);

    const position = (existingGuesses?.length ?? 0) + 1;

    await srv.from("duel_guesses").insert({
      duel_id: id,
      round_number: currentRound,
      user_id: user.id,
      position,
      unit_name: guessUnit["Unit Name"],
      feedback,
    });

    const now = new Date().toISOString();

    if (myCurrentRow) {
      const updates: Record<string, unknown> = { guess_count: position };
      if (!myCurrentRow.started_at) updates.started_at = now;

      if (solved) {
        const startedAt = (myCurrentRow.started_at as string | null) ?? now;
        const timeSeconds = Math.floor(
          (new Date(now).getTime() - new Date(startedAt).getTime()) / 1000
        );
        const wrongGuesses = position - 1;
        updates.completed_at = now;
        updates.solved = true;
        updates.time_seconds = timeSeconds;
        updates.score = Math.max(0, 5000 - wrongGuesses * 100 - timeSeconds);
      }

      await srv.from("duel_player_rounds").update(updates).eq("id", myCurrentRow.id);
    } else {
      const row: Record<string, unknown> = {
        duel_id: id,
        round_number: currentRound,
        user_id: user.id,
        started_at: now,
        guess_count: position,
      };

      if (solved) {
        row.completed_at = now;
        row.solved = true;
        row.time_seconds = 0;
        row.score = 5000; // first-guess solve with instant response = full points
      }

      await srv.from("duel_player_rounds").insert(row);
    }

    if (solved) {
      await checkAndFinalizeRound(srv, id, currentRound, duel.challenger_id, duel.challenged_id);
    }

    return NextResponse.json({
      feedback,
      solved,
      guess: { name: guessUnit["Unit Name"], faction: guessUnit.Faction },
      position,
    });
  } catch (err) {
    console.error("POST /api/duel/[id]/guess failed:", err);
    return NextResponse.json({ error: "Failed to process guess." }, { status: 500 });
  }
}
