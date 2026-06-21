import { NextResponse } from "next/server";
import { getDailyUnit, todayEst } from "@/app/lib/daily";
import { resolveAndJudge, type GuessRequestBody } from "@/app/lib/guessHandler";
import { recordGuess } from "@/app/lib/gameSession";
import { createClient } from "@/app/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GuessRequestBody;
    const target = await getDailyUnit();

    const result = await resolveAndJudge(body, target);
    if (!result.ok) return result.response;

    const { feedback, solved, guess } = result.data;

    // Persist the guess for signed-in users. Failures are logged but
    // don't break the game -- the guess result is still returned.
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await recordGuess(
          user.id,
          todayEst(),
          { id: guess["Unit ID"], modelLine: guess["Model Line"], name: guess["Unit Name"] },
          feedback,
          solved
        );
      }
    } catch (saveErr) {
      console.error("Failed to save guess for user:", saveErr);
    }

    return NextResponse.json({
      feedback,
      solved,
      guess: { name: guess["Unit Name"], faction: guess.Faction },
    });
  } catch (err) {
    console.error("POST /api/guess/daily failed:", err);
    return NextResponse.json({ error: "Failed to process guess." }, { status: 500 });
  }
}
