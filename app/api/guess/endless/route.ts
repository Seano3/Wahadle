import { NextResponse } from "next/server";
import { getRoundTarget } from "@/app/lib/units";
import { resolveAndJudgeGuess, type GuessRequestBody } from "@/app/lib/guessHandler";

export const dynamic = "force-dynamic";

type EndlessGuessBody = GuessRequestBody & { roundId?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as EndlessGuessBody;

    if (!body.roundId) {
      return NextResponse.json(
        { error: "Missing roundId. Start a round first." },
        { status: 400 }
      );
    }

    const target = await getRoundTarget(body.roundId);
    if (!target) {
      return NextResponse.json({ error: "Unknown round." }, { status: 404 });
    }

    // resolveAndJudgeGuess's response never includes `target` --
    // this is the actual point where the answer would leak if we
    // were careless, so it's worth being explicit: only `feedback`,
    // `solved`, and the GUESS's own name/faction go back to the
    // client below.
    return await resolveAndJudgeGuess(body, target);
  } catch (err) {
    console.error("POST /api/guess/endless failed:", err);
    return NextResponse.json(
      { error: "Failed to process guess." },
      { status: 500 }
    );
  }
}
