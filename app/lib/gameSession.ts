import { createClient } from "@/app/lib/supabase/server";
import type { Feedback } from "@/app/types";

export type SessionGuess = {
  position: number;
  unit_name: string;
  feedback: Feedback[];
};

export type DailySession = {
  id: string;
  solved: boolean;
  guess_count: number;
  guesses: SessionGuess[];
};

export async function getDailySession(
  userId: string,
  ymd: string
): Promise<DailySession | null> {
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("game_sessions")
    .select("id, solved, guess_count")
    .eq("user_id", userId)
    .eq("play_date", ymd)
    .maybeSingle();

  if (!session) return null;

  const { data: guesses } = await supabase
    .from("game_guesses")
    .select("position, unit_name, feedback")
    .eq("session_id", session.id)
    .order("position", { ascending: true });

  return {
    id: session.id,
    solved: session.solved,
    guess_count: session.guess_count,
    guesses: (guesses ?? []).map((g) => ({
      position: g.position,
      unit_name: g.unit_name,
      feedback: g.feedback as Feedback[],
    })),
  };
}

export async function recordGuess(
  userId: string,
  ymd: string,
  unit: { id: string; modelLine: number; name: string },
  feedback: Feedback[],
  solved: boolean
): Promise<void> {
  const supabase = await createClient();

  // Get or create the session for this user+day.
  let { data: session } = await supabase
    .from("game_sessions")
    .select("id, guess_count, solved")
    .eq("user_id", userId)
    .eq("play_date", ymd)
    .maybeSingle();

  if (!session) {
    const { data: created, error } = await supabase
      .from("game_sessions")
      .insert({ user_id: userId, play_date: ymd })
      .select("id, guess_count, solved")
      .single();
    if (error) throw error;
    session = created;
  }

  if (session.solved) return;

  const position = session.guess_count + 1;

  const { error: guessError } = await supabase.from("game_guesses").insert({
    session_id: session.id,
    position,
    unit_id: unit.id,
    model_line: unit.modelLine,
    unit_name: unit.name,
    feedback,
  });
  if (guessError) throw guessError;

  const { error: updateError } = await supabase
    .from("game_sessions")
    .update({ guess_count: position, solved })
    .eq("id", session.id);
  if (updateError) throw updateError;
}

export type UserStats = {
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  bestStreak: number;
  guessDistribution: Record<string, number>;
};

function prevDayUtc(ymd: string): string {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function nextDayUtc(ymd: string): string {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function getUserStats(userId: string, today: string): Promise<UserStats> {
  const supabase = await createClient();

  const { data: sessions } = await supabase
    .from("game_sessions")
    .select("play_date, solved, guess_count")
    .eq("user_id", userId)
    .gt("guess_count", 0)
    .order("play_date", { ascending: true });

  const rows = sessions ?? [];
  const gamesPlayed = rows.length;
  const gamesWon = rows.filter((s) => s.solved).length;

  const guessDistribution: Record<string, number> = {};
  for (const s of rows) {
    if (!s.solved) continue;
    const key = s.guess_count <= 6 ? String(s.guess_count) : "7+";
    guessDistribution[key] = (guessDistribution[key] ?? 0) + 1;
  }

  // Current streak: consecutive solved days ending today (or yesterday if today not yet played).
  const solvedDates = new Set(rows.filter((s) => s.solved).map((s) => s.play_date));
  let currentStreak = 0;
  let checkDate = solvedDates.has(today) ? today : prevDayUtc(today);
  while (solvedDates.has(checkDate)) {
    currentStreak++;
    checkDate = prevDayUtc(checkDate);
  }

  // Best streak: longest run of consecutive solved days.
  const solvedSorted = rows
    .filter((s) => s.solved)
    .map((s) => s.play_date)
    .sort();
  let bestStreak = 0;
  let tempStreak = 0;
  let prevDate: string | null = null;
  for (const date of solvedSorted) {
    if (prevDate !== null && date === nextDayUtc(prevDate)) {
      tempStreak++;
    } else {
      tempStreak = 1;
    }
    if (tempStreak > bestStreak) bestStreak = tempStreak;
    prevDate = date;
  }

  return { gamesPlayed, gamesWon, currentStreak, bestStreak, guessDistribution };
}
