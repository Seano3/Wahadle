import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";
import { createServiceRoleClient } from "@/app/lib/supabase/serviceRole";
import { getAllUnits } from "@/app/lib/units";
import { computeCurrentRound, type PlayerRoundRow } from "@/app/lib/duelHelpers";
import type { Feedback } from "@/app/types";

export const dynamic = "force-dynamic";

// GET /api/duel/[id]
// Returns full duel state for one participant.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const { id } = await params;
    const srv = createServiceRoleClient();

    const { data: duel, error: duelError } = await srv
      .from("duels")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (duelError || !duel) {
      return NextResponse.json({ error: "Duel not found." }, { status: 404 });
    }
    if (duel.challenger_id !== user.id && duel.challenged_id !== user.id) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const myId = user.id;
    const opponentId = myId === duel.challenger_id ? duel.challenged_id : duel.challenger_id;

    const { data: profiles } = await srv
      .from("profiles")
      .select("id, display_name")
      .in("id", [duel.challenger_id, duel.challenged_id]);

    const nameMap: Record<string, string> = {};
    for (const p of profiles ?? []) nameMap[p.id] = p.display_name ?? "Unknown";

    if (duel.status === "pending" || duel.status === "declined" || duel.status === "expired") {
      return NextResponse.json({
        id: duel.id,
        status: duel.status,
        challengerName: nameMap[duel.challenger_id] ?? "Unknown",
        challengedName: nameMap[duel.challenged_id] ?? "Unknown",
        myId,
        opponentId,
        opponentName: nameMap[opponentId] ?? "Unknown",
        currentRound: null,
        myCurrentRound: null,
        opponentCurrentRound: null,
        completedRounds: [],
        totalMyScore: 0,
        totalOpponentScore: 0,
        winner: null,
        winnerId: null,
      });
    }

    // Active or completed
    const { data: playerRoundsRaw } = await srv
      .from("duel_player_rounds")
      .select("*")
      .eq("duel_id", id);

    const playerRounds: PlayerRoundRow[] = playerRoundsRaw ?? [];

    const currentRound = computeCurrentRound(playerRounds, duel.challenger_id, duel.challenged_id);

    let myCurrentRound = null;
    let opponentCurrentRound = null;

    if (duel.status === "active" && currentRound <= 5) {
      const [myGuessesRes, oppGuessesRes] = await Promise.all([
        srv
          .from("duel_guesses")
          .select("position, unit_name, feedback")
          .eq("duel_id", id)
          .eq("round_number", currentRound)
          .eq("user_id", myId)
          .order("position", { ascending: true }),
        srv
          .from("duel_guesses")
          .select("position, feedback")
          .eq("duel_id", id)
          .eq("round_number", currentRound)
          .eq("user_id", opponentId)
          .order("position", { ascending: true }),
      ]);

      const myRow = playerRounds.find((p) => p.round_number === currentRound && p.user_id === myId);
      const oppRow = playerRounds.find((p) => p.round_number === currentRound && p.user_id === opponentId);

      myCurrentRound = {
        guesses: (myGuessesRes.data ?? []).map((g) => ({
          position: g.position,
          unitName: g.unit_name,
          feedback: g.feedback as Feedback[],
        })),
        completed: !!myRow?.completed_at,
        solved: myRow?.solved ?? false,
        score: myRow?.score ?? null,
      };

      opponentCurrentRound = {
        guessCount: oppGuessesRes.data?.length ?? 0,
        // Strip unit names — only return color patterns
        feedbackColors: (oppGuessesRes.data ?? []).map((g) => g.feedback as Feedback[]),
        completed: !!oppRow?.completed_at,
      };
    }

    // Gather completed round scores and target unit names
    const duelRoundsNeeded: number[] = [];
    for (let r = 1; r < Math.min(currentRound, 6); r++) duelRoundsNeeded.push(r);

    let duelRoundsData: { round_number: number; unit_id: string; model_line: number }[] = [];
    if (duelRoundsNeeded.length > 0) {
      const { data } = await srv
        .from("duel_rounds")
        .select("round_number, unit_id, model_line")
        .eq("duel_id", id)
        .in("round_number", duelRoundsNeeded);
      duelRoundsData = data ?? [];
    }

    // Fetch unit names for completed rounds
    const allUnitsForRounds: Record<string, string> = {};
    if (duelRoundsData.length > 0) {
      const allUnits = await getAllUnits();
      for (const dr of duelRoundsData) {
        const u = allUnits.find(
          (u) => u["Unit ID"] === dr.unit_id && u["Model Line"] === dr.model_line
        );
        allUnitsForRounds[dr.round_number] = u?.["Unit Name"] ?? "Unknown";
      }
    }

    const completedRounds = duelRoundsNeeded
      .map((r) => {
        const myRow = playerRounds.find((p) => p.round_number === r && p.user_id === myId);
        const oppRow = playerRounds.find((p) => p.round_number === r && p.user_id === opponentId);
        return {
          roundNumber: r,
          targetUnitName: allUnitsForRounds[r] ?? "Unknown",
          myScore: myRow?.score ?? 0,
          mySolved: myRow?.solved ?? false,
          myGuessCount: myRow?.guess_count ?? 0,
          myTimeSeconds: myRow?.time_seconds ?? null,
          opponentScore: oppRow?.score ?? 0,
          opponentSolved: oppRow?.solved ?? false,
          opponentGuessCount: oppRow?.guess_count ?? 0,
          opponentTimeSeconds: oppRow?.time_seconds ?? null,
        };
      })
      .filter((r) => {
        // Only include rounds where both players have a completed row
        const myRow = playerRounds.find((p) => p.round_number === r.roundNumber && p.user_id === myId);
        const oppRow = playerRounds.find((p) => p.round_number === r.roundNumber && p.user_id === opponentId);
        return myRow?.completed_at && oppRow?.completed_at;
      });

    const totalMyScore = completedRounds.reduce((s, r) => s + r.myScore, 0);
    const totalOpponentScore = completedRounds.reduce((s, r) => s + r.opponentScore, 0);

    let winner: "me" | "opponent" | "tie" | null = null;
    if (duel.status === "completed") {
      if (!duel.winner_id) winner = "tie";
      else winner = duel.winner_id === myId ? "me" : "opponent";
    }

    return NextResponse.json({
      id: duel.id,
      status: duel.status,
      challengerName: nameMap[duel.challenger_id] ?? "Unknown",
      challengedName: nameMap[duel.challenged_id] ?? "Unknown",
      myId,
      opponentId,
      opponentName: nameMap[opponentId] ?? "Unknown",
      currentRound: currentRound <= 5 ? currentRound : null,
      myCurrentRound,
      opponentCurrentRound,
      completedRounds,
      totalMyScore,
      totalOpponentScore,
      winner,
      winnerId: duel.winner_id,
    });
  } catch (err) {
    console.error("GET /api/duel/[id] failed:", err);
    return NextResponse.json({ error: "Failed to load duel." }, { status: 500 });
  }
}

// PATCH /api/duel/[id]
// Body: { action: "accept" | "decline" | "cancel" }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const { id } = await params;
    const { action } = await req.json();

    if (!["accept", "decline", "cancel"].includes(action)) {
      return NextResponse.json({ error: "action must be accept, decline, or cancel." }, { status: 400 });
    }

    const srv = createServiceRoleClient();

    const { data: duel } = await srv.from("duels").select("*").eq("id", id).maybeSingle();
    if (!duel) return NextResponse.json({ error: "Duel not found." }, { status: 404 });

    if (duel.challenger_id !== user.id && duel.challenged_id !== user.id) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (duel.status !== "pending") {
      return NextResponse.json({ error: "Duel is no longer pending." }, { status: 409 });
    }

    if (action === "decline" && duel.challenged_id !== user.id) {
      return NextResponse.json({ error: "Only the challenged player can decline." }, { status: 403 });
    }
    if (action === "cancel" && duel.challenger_id !== user.id) {
      return NextResponse.json({ error: "Only the challenger can cancel." }, { status: 403 });
    }

    if (action === "decline") {
      await srv.from("duels").update({ status: "declined" }).eq("id", id);
      return NextResponse.json({ ok: true });
    }
    if (action === "cancel") {
      await srv.from("duels").update({ status: "expired" }).eq("id", id);
      return NextResponse.json({ ok: true });
    }

    // Accept: pick 5 unique random units and seed duel_rounds
    const allUnits = await getAllUnits();
    if (allUnits.length < 5) {
      return NextResponse.json({ error: "Not enough units to start a duel." }, { status: 500 });
    }

    const shuffled = [...allUnits].sort(() => Math.random() - 0.5);
    const picks = shuffled.slice(0, 5);

    const roundRows = picks.map((u, i) => ({
      duel_id: id,
      round_number: i + 1,
      unit_id: u["Unit ID"],
      model_line: u["Model Line"],
    }));

    const { error: roundsError } = await srv.from("duel_rounds").insert(roundRows);
    if (roundsError) throw roundsError;

    const { error: updateError } = await srv
      .from("duels")
      .update({ status: "active" })
      .eq("id", id);
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, duelId: id });
  } catch (err) {
    console.error("PATCH /api/duel/[id] failed:", err);
    return NextResponse.json({ error: "Failed to update duel." }, { status: 500 });
  }
}
