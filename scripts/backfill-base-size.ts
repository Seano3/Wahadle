/**
 * One-off backfill: re-judges every stored `game_guesses` row so its
 * `feedback` JSON picks up the new "Base Size" field. These rows were
 * written by app/lib/gameSession.ts#recordGuess before Base Size
 * existed as a FIELDS entry (see app/lib/judge.ts), so the daily page
 * -- which replays stored feedback verbatim on reload instead of
 * re-judging -- was showing guesses with a missing 11th tile.
 *
 * duel_guesses has the same problem but isn't covered here: that
 * table never stored the guessed unit's id/model_line (only
 * unit_name, which isn't a reliable enough key to re-resolve a
 * variant), so there's no safe way to re-derive what was guessed.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-base-size.ts [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import { toUnitRow } from "../app/lib/units";
import { judge } from "../app/lib/judge";
import type { Feedback, UnitRow } from "../app/types";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // PostgREST caps unbounded selects at 1000 rows by default, and the
  // units view has 1200+ rows -- page through it explicitly or the
  // tail end silently goes missing.
  const unitsByVariant = new Map<string, UnitRow>();
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error: unitsErr } = await supabase
      .from("units")
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (unitsErr) throw unitsErr;
    for (const row of page ?? []) {
      const unit = toUnitRow(row as Parameters<typeof toUnitRow>[0]);
      unitsByVariant.set(`${unit["Unit ID"]}::${unit["Model Line"]}`, unit);
    }
    if (!page || page.length < PAGE_SIZE) break;
  }
  console.log(`Loaded ${unitsByVariant.size} guessable unit variants.`);

  const { data: targets, error: targetsErr } = await supabase
    .from("daily_targets")
    .select("play_date, unit_id, model_line");
  if (targetsErr) throw targetsErr;
  const targetByDate = new Map(
    (targets ?? []).map((t) => [t.play_date, `${t.unit_id}::${t.model_line}`])
  );

  const { data: sessions, error: sessionsErr } = await supabase
    .from("game_sessions")
    .select("id, play_date");
  if (sessionsErr) throw sessionsErr;
  const dateBySession = new Map((sessions ?? []).map((s) => [s.id, s.play_date]));

  const { data: guesses, error: guessesErr } = await supabase
    .from("game_guesses")
    .select("id, session_id, unit_id, model_line, feedback");
  if (guessesErr) throw guessesErr;

  let updated = 0;
  let alreadyCurrent = 0;
  let skippedNoTarget = 0;
  let skippedUnknownUnit = 0;

  for (const g of guesses ?? []) {
    const existing = g.feedback as Feedback[];
    if (existing.some((f) => f.field === "Base Size")) {
      alreadyCurrent++;
      continue;
    }

    const playDate = dateBySession.get(g.session_id);
    const targetKey = playDate ? targetByDate.get(playDate) : undefined;
    if (!targetKey) {
      skippedNoTarget++;
      continue;
    }

    const guessUnit = unitsByVariant.get(`${g.unit_id}::${g.model_line}`);
    const targetUnit = unitsByVariant.get(targetKey);
    if (!guessUnit || !targetUnit) {
      skippedUnknownUnit++;
      continue;
    }

    const feedback = judge(guessUnit, targetUnit);
    updated++;
    if (dryRun) continue;

    const { error: updateErr } = await supabase
      .from("game_guesses")
      .update({ feedback })
      .eq("id", g.id);
    if (updateErr) throw updateErr;
  }

  console.log(
    `${dryRun ? "[dry run] " : ""}Updated: ${updated}, already current: ${alreadyCurrent}, ` +
      `skipped (no daily target for that date): ${skippedNoTarget}, ` +
      `skipped (unit no longer in units view): ${skippedUnknownUnit}.`
  );
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
