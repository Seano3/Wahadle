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

## Status as of writing (June 2026)

11th edition launched today. Wahapedia has **not yet** published an
11th-edition export -- their site still serves 10th-edition data at
`wahapedia.ru/wh40k10ed/...` as of this writing, and their own
process is "I update files... it takes 15 minutes" but only *after*
the site itself is updated, which takes longer than a day for a
full edition migration historically. Check `wahapedia.ru` directly
before assuming an `wh40k11ed` path exists.

When it does appear, this script should work against it by just
changing the `--dir` you download into (see below) -- the file
*format* (pipe-delimited, same column names) is expected to carry
over, since Wahapedia has used this same export format across at
least 9th, 10th, and (per their own description of the process)
presumably 11th edition too. The one thing worth re-checking when
that day comes: the cost/squad-size file's name has changed before
(`Datasheets_unit_composition.csv` vs `DS_Model Costs.csv` across
different points in 10th edition's life) -- `refresh.ts` already
tries a few known candidates and will tell you clearly if none
match, rather than silently importing zero cost rows.

## Step 1: Download the export

Wahapedia doesn't offer a single zip download -- each table is its
own CSV file, fetched individually:

```bash
mkdir -p wahapedia-export
cd wahapedia-export

EDITION=wh40k10ed  # change to wh40k11ed once it exists

for file in Factions Source Datasheets Datasheets_models \
            Datasheets_keywords Datasheets_unit_composition; do
  curl -L "https://wahapedia.ru/$EDITION/$file.csv" -o "$file.csv"
done
```

If `Datasheets_unit_composition.csv` comes back empty or 404s, try
`DS_Model%20Costs.csv` instead (URL-encode the space), or check
`https://wahapedia.ru/$EDITION/the-rules/data-export/` for the
current file list and the linked Export Data Specs document.

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
