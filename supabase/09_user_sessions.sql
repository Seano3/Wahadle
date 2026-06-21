-- Adds per-user game history tracking for the daily puzzle.
--
-- game_sessions: one row per user per calendar day. Unique on
-- (user_id, play_date). Stores whether the puzzle was solved and
-- how many guesses it took.
--
-- game_guesses: one row per guess within a session. Stores the
-- guessed unit (denormalized unit_name so display survives unit
-- removals) and the full feedback JSON from judge.ts.
--
-- RLS: users can only read/write their own rows.

create table public.game_sessions (
  id          uuid        not null default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  play_date   date        not null,
  solved      boolean     not null default false,
  guess_count int         not null default 0,
  created_at  timestamptz not null default now(),
  constraint  game_sessions_pkey primary key (id),
  constraint  game_sessions_user_date_key unique (user_id, play_date)
);

create table public.game_guesses (
  id          uuid        not null default gen_random_uuid(),
  session_id  uuid        not null references public.game_sessions(id) on delete cascade,
  position    int         not null,
  unit_id     text        not null,
  model_line  bigint      not null,
  unit_name   text        not null,
  feedback    jsonb       not null,
  created_at  timestamptz not null default now(),
  constraint  game_guesses_pkey primary key (id),
  constraint  game_guesses_session_position_key unique (session_id, position)
);

alter table public.game_sessions enable row level security;
alter table public.game_guesses enable row level security;

create policy "Users manage own sessions"
  on public.game_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own guesses"
  on public.game_guesses for all
  using (
    exists (
      select 1 from public.game_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.game_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );
