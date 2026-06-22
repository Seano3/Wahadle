import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";
import { createServiceRoleClient } from "@/app/lib/supabase/serviceRole";
import { computeCurrentRound } from "@/app/lib/duelHelpers";

export const dynamic = "force-dynamic";

// POST /api/duel/[id]/giveup
// Body: { roundNumber: number }
// Marks the current player's round as completed with 0 points.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const { id } = await params;
    const { roundNumber } = await req.json();

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerRounds: any[] = playerRoundsRaw ?? [];
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

    const now = new Date().toISOString();

    if (myCurrentRow) {
      const startedAt: string | null = myCurrentRow.started_at ?? null;
      const timeSeconds = startedAt
        ? Math.floor((new Date(now).getTime() - new Date(startedAt).getTime()) / 1000)
        : 0;
      await srv.from("duel_player_rounds").update({
        completed_at: now,
        solved: false,
        score: 0,
        time_seconds: timeSeconds,
      }).eq("id", myCurrentRow.id);
    } else {
      await srv.from("duel_player_rounds").insert({
        duel_id: id,
        round_number: currentRound,
        user_id: user.id,
        started_at: now,
        completed_at: now,
        guess_count: 0,
        solved: false,
        score: 0,
        time_seconds: 0,
      });
    }

    // Check if this completes round 5 and finalizes the duel
    if (currentRound === 5) {
      const { data: updatedRows } = await srv
        .from("duel_player_rounds")
        .select("user_id, completed_at, score")
        .eq("duel_id", id)
        .eq("round_number", 5);

      const rows = updatedRows ?? [];
      const cDone = rows.find((r) => r.user_id === duel.challenger_id && r.completed_at);
      const dDone = rows.find((r) => r.user_id === duel.challenged_id && r.completed_at);

      if (cDone && dDone) {
        const { data: allRounds } = await srv
          .from("duel_player_rounds")
          .select("user_id, score")
          .eq("duel_id", id);

        const all = allRounds ?? [];
        const cTotal = all
          .filter((r) => r.user_id === duel.challenger_id)
          .reduce((s, r) => s + (r.score ?? 0), 0);
        const dTotal = all
          .filter((r) => r.user_id === duel.challenged_id)
          .reduce((s, r) => s + (r.score ?? 0), 0);

        const winnerId = cTotal > dTotal ? duel.challenger_id : dTotal > cTotal ? duel.challenged_id : null;

        await srv.from("duels").update({ status: "completed", winner_id: winnerId }).eq("id", id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/duel/[id]/giveup failed:", err);
    return NextResponse.json({ error: "Failed to process give up." }, { status: 500 });
  }
}
