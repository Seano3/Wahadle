import { NextResponse } from "next/server";
import { getUnitByVariant, parseVariantKey } from "@/app/lib/units";
import { judge } from "@/app/lib/judge";
import type { UnitRow } from "@/app/types";

export type GuessRequestBody = {
  variantKey?: string;
};

/**
 * Resolves a guess request body to the guessed UnitRow, judges it
 * against `target`, and returns the NextResponse to send back --
 * or returns an error NextResponse if the variant_key is missing
 * or doesn't resolve to a real unit.
 *
 * Guesses are identified ONLY by variant_key (unit_id::model_line)
 * now, not by name or id alone. The old API accepted id/name/
 * faction/points and cross-checked them against each other to
 * catch ambiguous matches (see the old guess/debug route) -- that
 * whole class of ambiguity goes away once the client always sends
 * the exact variant it picked from the search dropdown, since
 * variant_key is the one identifier the corrected `units` view
 * actually guarantees is unique.
 */
export async function resolveAndJudgeGuess(
  body: GuessRequestBody,
  target: UnitRow
): Promise<NextResponse> {
  if (!body.variantKey) {
    return NextResponse.json(
      { error: "Missing variantKey. Select a unit from the suggestions list." },
      { status: 400 }
    );
  }

  const parsed = parseVariantKey(body.variantKey);
  if (!parsed) {
    return NextResponse.json(
      { error: "Malformed variantKey." },
      { status: 400 }
    );
  }

  const guess = await getUnitByVariant(parsed.unitId, parsed.modelLine);
  if (!guess) {
    return NextResponse.json({ error: "Unknown unit." }, { status: 404 });
  }

  const feedback = judge(guess, target);
  const solved = feedback.every((f) => f.status === "correct");

  return NextResponse.json({
    feedback,
    solved,
    guess: { name: guess["Unit Name"], faction: guess.Faction },
  });
}
