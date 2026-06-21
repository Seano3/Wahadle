# Wahadle

Wahadle is a Wordle-like web game for identifying Warhammer 40k datasheets by comparing unit stats. The app uses a Supabase Edge Function to produce an aggregated dataset of datasheets and a Next.js frontend (App Router) for gameplay.

This is not an offical Games Workshop product. I am just a fan of the tabletop game and though this would be a fun idea :)

## Features

- Search suggestions.
- Accounts system using Supabase Authentication
- Friends system to compare and see scores
- Data comes from a Supabase prosgres database rows from a `units` SQL view.
- Daily and endless mode
- Daily game progress is saved to accounts
