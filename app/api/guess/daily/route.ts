import { NextResponse } from "next/server";
import { getDailyUnit } from "@/app/lib/daily";
import { resolveAndJudgeGuess, type GuessRequestBody } from "@/app/lib/guessHandler";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GuessRequestBody;
    const target = await getDailyUnit();
    return await resolveAndJudgeGuess(body, target);
  } catch (err) {
    console.error("POST /api/guess/daily failed:", err);
    return NextResponse.json(
      { error: "Failed to process guess." },
      { status: 500 }
    );
  }
}
