# Wahadle data refresh

Scripts for pulling Wahapedia's CSV export into the Wahadle database.
Run these from your own machine -- they need network access to
wahapedia.ru, and the app's own server environment shouldn't have
(or need) that.

## Why this exists

The Wahadle database is a point-in-time snapshot of Wahapedia's
export. Whenever Wahapedia updates their data (errata, new
datasheets, points changes, edition migrations), this snapshot
goes stale. `refresh.ts` re-syncs it.

## Status as of writing (August 2026)

Wahapedia has published their 11th-edition export at
`wahapedia.ru/wh40k11ed/...` (confirmed live -- `edition` column
reads `11` for updated Source rows, faction links point at
`/wh40k11ed/factions/...`, and datasheet/faction counts differ from
the 10th-edition path). The admin "Check for updates" button and
`applyImport` API routes (`app/api/admin/import/{preview,apply}/
route.ts`) now default to `wh40k11ed`. The old `wh40k10ed` path is
still live too (Wahapedia keeps prior editions' exports up, still
receiving errata as of this writing) -- pass `{ "edition": "wh40k10ed" }`
in the request body if you ever need to pull that one instead.

The file *format* (pipe-delimited, same column names) carried over
from 10th to 11th edition, as expected.

## Step 1: Download the export

Confirmed against Wahapedia's own Export Data Specs document
(the xlsx linked from `wahapedia.ru/$EDITION/the-rules/data-export/`)
-- there's no single zip download, each table is its own CSV file,
fetched individually:

```bash
mkdir -p wahapedia-export
cd wahapedia-export

EDITION=wh40k11ed  # wh40k10ed still works too, if you need the old edition's data

for file in Factions Source Datasheets Datasheets_models \
            Datasheets_keywords Datasheets_models_cost; do
  curl -L "https://wahapedia.ru/$EDITION/$file.csv" -o "$file.csv"
done
```

Note: `Datasheets_unit_composition.csv` is a *different* table
(just a unit-composition description, no cost field) -- don't
confuse it with `Datasheets_models_cost.csv`, which is the one this
app actually needs (datasheet_id/line/description/cost). If a
future Wahapedia export revision renames it again, `refresh.ts`
tries a couple of known alternate names and will tell you clearly
if none match, rather than silently importing zero cost rows.

Sanity-check before importing: open `Datasheets.csv` and confirm it
has a real header row (`id|name|faction_id|...`) and a few thousand
data rows, not an HTML error page saved with a `.csv` extension.

## Step 2: Get your Supabase service role key

Project Settings > API > service_role key (NOT the anon key --
this script needs to bypass RLS to do bulk deletes; see the comment
at the top of `refresh.ts` for why that's the right call only for
this offline script, not for the app itself).

## Step 3: Dry run first

```bash
cd /path/to/Wahadle
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
  npx tsx scripts/import/refresh.ts --dir ./wahapedia-export --dry-run
```

This prints what it *would* do (row counts, how many datasheets
would be soft- vs hard-deleted) without writing anything. Read the
output. If the "hard-deleted" count looks surprisingly large,
something is probably wrong with the export download (e.g. a
truncated file), not with your data -- stop and check before
proceeding.

## Step 4: Run it for real

Same command without `--dry-run`.

## After running

- Spot-check a few units in the admin editor (`/admin/units`) to
  confirm stats look right, especially for any faction GW updated
  recently.
- If you're refreshing because 11th edition's first wave of
  faction books landed (Space Marines, Orks, the announced third
  faction), specifically check those factions' units -- those are
  the ones most likely to have actually changed stats, not just
  the source/legend metadata.
- Run `select count(*) from "Datasheets" where removed = true;` --
  these are datasheets that disappeared from the export but are
  kept around because a past daily/round answer points at them.
  There's normally nothing to do about these; they're just not
  meant to show up anywhere in the game going forward.
