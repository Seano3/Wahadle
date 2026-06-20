-- ============================================================
-- Wahadle: daily targets
-- Run this on the same Supabase project, AFTER 01_schema.sql
-- and the data restore.
-- ============================================================
-- Persists which unit was shown as "today's" target on each UTC
-- calendar date, the first time that date is requested. Without
-- this, a pure hash(date) % units.length approach would silently
-- change a past date's answer whenever the dataset's row count
-- changes (Wahapedia refresh, admin edit) -- see app/lib/daily.ts
-- for the full reasoning.
-- ============================================================

create table if not exists public.daily_targets (
  play_date   date not null,
  unit_id     text not null,
  model_line  bigint not null,
  created_at  timestamptz not null default now(),
  constraint daily_targets_pkey primary key (play_date),
  constraint daily_targets_unit_fkey
    foreign key (unit_id, model_line)
    references public."Datasheets_models"(datasheet_id, line)
);

alter table public.daily_targets enable row level security;

-- Anyone can read which unit was today's (and past) target -- this
-- is necessary for the game itself to function, and isn't secret
-- (today's answer is, by definition, guessable through play).
create policy "Public read access" on public.daily_targets
  for select using (true);

-- Only the server (using the user's session, not the anon key
-- directly) ever writes here, via the upsert in getDailyUnit().
-- Writing is allowed for any authenticated-or-anonymous request
-- because the row content is fully determined by server logic
-- (today's date + deterministic hash), not user input -- there's
-- nothing a malicious write here could corrupt that the read path
-- doesn't already constrain via the foreign key above.
create policy "Server can upsert today's target" on public.daily_targets
  for insert with check (true);

-- ============================================================
-- Endless / round-based play
--
-- Holds the target for an in-progress endless round server-side,
-- referenced by an opaque round id the client holds instead of
-- the target's identity directly. Without this, a player could
-- read the answer straight out of the network tab the moment the
-- round starts (the old app's /api/endless had exactly this gap).
--
-- This also doubles as the foundation for duel mode later: a duel
-- is just a round with more than one player attached and a
-- start/end time for scoring, rather than a separate system.
-- ============================================================
create table if not exists public.rounds (
  id          uuid not null default gen_random_uuid(),
  unit_id     text not null,
  model_line  bigint not null,
  mode        text not null default 'endless',
  created_at  timestamptz not null default now(),
  constraint rounds_pkey primary key (id),
  constraint rounds_unit_fkey
    foreign key (unit_id, model_line)
    references public."Datasheets_models"(datasheet_id, line),
  constraint rounds_mode_check check (mode in ('endless', 'duel'))
);

alter table public.rounds enable row level security;

create policy "Anyone can start a round" on public.rounds
  for insert with check (true);

-- Readable by anyone who already has the round's id (a UUID,
-- effectively a bearer token -- nobody can enumerate or guess
-- one). The actual safety boundary against leaking the answer is
-- NOT here: it's that app/api/.../route.ts (the Next.js server
-- handler) reads this row to judge a guess server-side and never
-- includes the target's unit_id/model_line in the JSON it sends
-- back to the browser. RLS on this table only needs to stop
-- OTHER users' browsers from reading someone else's round by
-- guessing a different round's content shape -- which isn't
-- possible anyway without already knowing that round's id.
create policy "Holder of round id can read it" on public.rounds
  for select using (true);
