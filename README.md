# Wahadle

Wahadle is a Wordle-like web game for identifying Warhammer 40k datasheets by comparing unit stats. The app uses a Supabase Edge Function to produce an aggregated dataset of datasheets and a Next.js frontend (App Router) for gameplay.


## Features

- Search suggestions with variant-aware matching (datasheet sizes treated as separate suggestions).
- Exact variant selection using `variant_key` (Unit ID + Model Count) to avoid ambiguous name matches.
- Server-side validation of guesses (checks faction and points to avoid mixups). A debug endpoint is included to inspect mismatches.
- Data comes from a Supabase Edge Function that aggregates rows from a `units` SQL view.

## Prerequisites

- Node.js (16+) and npm installed
- A Supabase project (for the Edge Function or to host the `units` view). You need the project URL and anon key to fetch the dataset.

## Environment

Create a `.env.local` (Next.js) in the project root with the following values:

```powershell
# .env.local (example)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

Notes:
- The app's server code calls `loadUnits()` which uses `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` to invoke the Supabase Edge Function named `unti-view`. Make sure the keys are set for local development.
- Do not commit these keys

## Install & Run (development)

Install dependencies and start the Next.js dev server:

```powershell
npm install
npm run dev
```

Open http://localhost:3000 to view the app.


## Important Files

- `app/lib/csv.ts` — `loadUnits()` implementation. It calls the Supabase Edge Function `unti-view`, expands aggregated `models` into individual `UnitRow` entries (one per variant), and returns the array. Currently it fetches fresh data on every call.
- `supabase/Edge_Functions/get-units.ts` — Edge Function that queries the `units` view and returns aggregated rows (in development this appears as `return.json` example data).
- `app/api/units/route.ts` — Suggestion API used by the frontend. It normalizes names, deduplicates by name+model_count+faction and returns suggestion objects (including `variant_key`).
- `app/api/guess/route.ts` — Guess API that accepts `{ id?, name?, variant_key?, faction?, points? }`. It prefers `variant_key` for exact variant matching and validates faction & points.
- `app/api/guess/debug/route.ts` — Temporary debug endpoint that echoes the incoming payload and the matched unit (useful when the server returns 400 and you need to inspect mismatches).

## API Reference

- GET `/api/units?q=...` — Returns up to 20 suggestion objects. Each suggestion includes:
	- `id` (Unit ID)
	- `name` (Unit Name)
	- `faction`
	- `points`
	- `model_count`
	- `variant_key` (format: `UnitID::ModelCount`), use this to select an exact datasheet variant.

- POST `/api/guess` — Submit a guess. Payload can include `{ id?, name?, variant_key?, faction?, points? }`.
	- The server will prefer `variant_key` (exact variant) then `id`, then `name` to resolve the guess.
	- If `faction`/`points` are supplied, the server validates them and returns `400` with a descriptive JSON body if they don't match.

- POST `/api/guess/debug` — Debug endpoint that returns the provided body, whether a match was found, matched unit fields, and any mismatch reasons (helpful for debugging 400 responses).

## Troubleshooting

- If suggestions are missing or ambiguous:
	- Try the debug endpoint: POST the same payload to `/api/guess/debug` and inspect the response. It shows which unit matched and where mismatches occur.
	- Ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` point to the Supabase project that hosts the `units` view or the Edge Function.

- If you receive `400` with `Points do not match selected unit`:
	- The request will include a JSON response showing `provided` and `actual` points (and rounded values). Use that to determine whether the UI sent the wrong `points` value or whether the server has a different points value.

## Performance & Caching

- By default `loadUnits()` currently fetches fresh data on each call to ensure the UI sees updates immediately. This is safer for development but increases calls to the Edge Function.
- Options:
	- Add a short in-memory TTL (e.g., 30s) in `app/lib/csv.ts` if you want a compromise between freshness and performance.
	- Re-enable module-level caching in production only (e.g., check `process.env.NODE_ENV`).

## Contributing

Feel free to open issues or pull requests. If you change the dataset shape, update `app/lib/csv.ts` and `app/types.ts` accordingly.

## License

MIT — see LICENSE or add one if you want.

## Author

Sean Thornton

