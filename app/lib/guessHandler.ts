import { NextResponse } from "next/server";
import { getUnitByVariant, parseVariantKey } from "@/app/lib/units";
import { judge } from "@/app/lib/judge";
import type { Feedback, UnitRow } from "@/app/types";

export type GuessRequestBody = {
  variantKey?: string;
};

export type JudgeSuccess = {
  feedback: Feedback[];
  solved: boolean;
  guess: UnitRow;
};

/**
 * Resolves the variantKey in the request body to a UnitRow, judges
 * it against target, and returns the raw result. Returns an error
 * NextResponse instead if the key is missing, malformed, or unknown.
 */
export async function resolveAndJudge(
  body: GuessRequestBody,
  target: UnitRow
): Promise<{ ok: true; data: JudgeSuccess } | { ok: false; response: NextResponse }> {
  if (!body.variantKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Missing variantKey. Select a unit from the suggestions list." },
        { status: 400 }
      ),
    };
  }

  const parsed = parseVariantKey(body.variantKey);
  if (!parsed) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Malformed variantKey." }, { status: 400 }),
    };
  }

  const guess = await getUnitByVariant(parsed.unitId, parsed.modelLine);
  if (!guess) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unknown unit." }, { status: 404 }),
    };
  }

  const feedback = judge(guess, target);
  const solved = feedback.every((f) => f.status === "correct");

  return { ok: true, data: { feedback, solved, guess } };
}

/** Convenience wrapper used by routes that don't need the raw judgment (e.g. endless). */
export async function resolveAndJudgeGuess(
  body: GuessRequestBody,
  target: UnitRow
): Promise<NextResponse> {
  const result = await resolveAndJudge(body, target);
  if (!result.ok) return result.response;
  const { feedback, solved, guess } = result.data;
  return NextResponse.json({
    feedback,
    solved,
    guess: { name: guess["Unit Name"], faction: guess.Faction },
  });
}
