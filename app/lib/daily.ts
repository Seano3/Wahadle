import { createClient } from "@/app/lib/supabase/server";
import { getAllUnits, getUnitByVariant } from "@/app/lib/units";
import type { UnitRow } from "@/app/types";

/**
 * Returns "today" as a UTC calendar date string (YYYY-MM-DD), so
 * the daily unit changes at the same instant for every player
 * regardless of their local timezone.
 */
export function todayUtc(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function hashDate(ymd: string): number {
  let h = 2166136261;
  for (let i = 0; i < ymd.length; i++) {
    h ^= ymd.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h);
}

/**
 * Picks "today's" unit and PERSISTS the choice in `daily_targets`
 * the first time it's requested for that date.
 *
 * Why persist rather than just hashing the date on every call (the
 * old approach): a pure `hash(date) % units.length` reseats every
 * future date's answer the moment the dataset's row count changes
 * -- which will happen often, since 11th-edition updates and your
 * own admin edits both add/remove units. A date that's already
 * been played shouldn't retroactively change its answer. Writing
 * the pick once, on first request, makes every subsequent request
 * for that same date return the same unit forever, independent of
 * later catalog changes.
 */
export async function getDailyUnit(date = new Date()): Promise<UnitRow> {
  const ymd = todayUtc(date);
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("daily_targets")
    .select("unit_id, model_line")
    .eq("play_date", ymd)
    .maybeSingle();

  if (readError) throw readError;

  if (existing) {
    const unit = await getUnitByVariant(existing.unit_id, existing.model_line);
    if (unit) return unit;
    // Referenced unit no longer exists (e.g. removed via the admin
    // editor) -- fall through and pick a fresh one for this date.
  }

  const units = await getAllUnits();
  if (units.length === 0) {
    throw new Error("No units available to pick a daily target from.");
  }
  const idx = hashDate(ymd) % units.length;
  const chosen = units[idx];

  // Upsert so a race between two simultaneous first-requests for
  // the same date doesn't throw -- whichever insert wins, both
  // requests end up reading the same persisted row.
  const { error: writeError } = await supabase
    .from("daily_targets")
    .upsert(
      {
        play_date: ymd,
        unit_id: chosen["Unit ID"],
        model_line: chosen["Model Line"],
      },
      { onConflict: "play_date", ignoreDuplicates: true }
    );
  if (writeError) throw writeError;

  return chosen;
}

