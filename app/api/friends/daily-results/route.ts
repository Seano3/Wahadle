import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";
import { createServiceRoleClient } from "@/app/lib/supabase/serviceRole";
import { todayEst } from "@/app/lib/daily";
import type { Feedback } from "@/app/types";

export const dynamic = "force-dynamic";

export type FriendDailyResult = {
  displayName: string;
  userId: string;
  played: boolean;
  solved: boolean;
  guessCount: number;
  guesses: { unitName: string; feedback: Feedback[] }[];
};

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    // Collect accepted friend user IDs (either direction).
    const { data: requests } = await supabase
      .from("friend_requests")
      .select("from_user, to_user")
      .eq("status", "accepted");

    const friendIds = (requests ?? []).map((r) =>
      r.from_user === user.id ? r.to_user : r.from_user
    );

    if (friendIds.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch friend display names.
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", friendIds);

    const nameMap: Record<string, string> = {};
    for (const p of profiles ?? []) nameMap[p.id] = p.display_name ?? "Unknown";

    // Use service role to read friends' sessions and guesses (RLS only
    // allows users to read their own rows).
    const admin = createServiceRoleClient();
    const today = todayEst();

    const { data: sessions } = await admin
      .from("game_sessions")
      .select("id, user_id, solved, guess_count")
      .in("user_id", friendIds)
      .eq("play_date", today);

    const sessionIds = (sessions ?? []).map((s) => s.id);
    const { data: allGuesses } = sessionIds.length > 0
      ? await admin
          .from("game_guesses")
          .select("session_id, position, unit_name, feedback")
          .in("session_id", sessionIds)
          .order("position", { ascending: true })
      : { data: [] };

    // Group guesses by session_id.
    const guessesBySession: Record<string, { unitName: string; feedback: Feedback[] }[]> = {};
    for (const g of allGuesses ?? []) {
      if (!guessesBySession[g.session_id]) guessesBySession[g.session_id] = [];
      guessesBySession[g.session_id].push({
        unitName: g.unit_name,
        feedback: g.feedback as Feedback[],
      });
    }

    // Build one result per friend (include friends who haven't played yet).
    const results: FriendDailyResult[] = friendIds.map((id) => {
      const session = (sessions ?? []).find((s) => s.user_id === id);
      if (!session) {
        return {
          displayName: nameMap[id] ?? "Unknown",
          userId: id,
          played: false,
          solved: false,
          guessCount: 0,
          guesses: [],
        };
      }
      return {
        displayName: nameMap[id] ?? "Unknown",
        userId: id,
        played: true,
        solved: session.solved,
        guessCount: session.guess_count,
        guesses: guessesBySession[session.id] ?? [],
      };
    });

    // Sort: solved first (fewest guesses first), then played-but-unsolved, then not-played.
    results.sort((a, b) => {
      if (a.solved !== b.solved) return a.solved ? -1 : 1;
      if (a.played !== b.played) return a.played ? -1 : 1;
      return a.guessCount - b.guessCount;
    });

    return NextResponse.json(results);
  } catch (err) {
    console.error("GET /api/friends/daily-results failed:", err);
    return NextResponse.json({ error: "Failed to load friends' results." }, { status: 500 });
  }
}
