-- Adds duel (1v1 asynchronous) mode between friends.
--
-- duels: one row per challenge. challenger_id invites challenged_id.
--   Pending invites expire after 24 h. Status flow:
--   pending -> active (on accept) -> completed (after round 5)
--             -> declined (challenged rejects)
--             -> expired  (challenger cancels or 24 h elapsed)
--
-- duel_rounds: 5 rows per duel, seeded when the challenged player accepts.
--   Stores the target unit directly to avoid coupling to the rounds table.
--
-- duel_player_rounds: one row per (player, round). Tracks timing and score.
--   started_at is set on the player's first guess; completed_at when solved or
--   gave up. score = max(0, 1000 - wrong_guesses*100 - time_seconds).
--
-- duel_guesses: one row per guess within a duel round.
--   unit_name is intentionally withheld from the opponent's client view;
--   all cross-player reads go through server API routes (service-role) which
--   strip unit_name before responding.
--
-- RLS: all writes go through service-role API routes.
--   Read policies exist for transparency but are not relied on for security.

-- ---------------------------------------------------------------
-- 1. Duels table
-- ---------------------------------------------------------------
create table public.duels (
  id             uuid        not null default gen_random_uuid(),
  challenger_id  uuid        not null references auth.users(id) on delete cascade,
  challenged_id  uuid        not null references auth.users(id) on delete cascade,
  status         text        not null default 'pending'
                             check (status in ('pending','active','completed','declined','expired')),
  winner_id      uuid        references auth.users(id),
  expires_at     timestamptz not null default (now() + interval '24 hours'),
  created_at     timestamptz not null default now(),
  constraint duels_pkey primary key (id),
  constraint duels_no_self check (challenger_id <> challenged_id)
);

-- ---------------------------------------------------------------
-- 2. Duel rounds (5 per duel, seeded when duel is accepted)
-- ---------------------------------------------------------------
create table public.duel_rounds (
  id            uuid not null default gen_random_uuid(),
  duel_id       uuid not null references public.duels(id) on delete cascade,
  round_number  int  not null check (round_number between 1 and 5),
  unit_id       text not null,
  model_line    int  not null,
  constraint duel_rounds_pkey primary key (id),
  constraint duel_rounds_unique unique (duel_id, round_number)
);

-- ---------------------------------------------------------------
-- 3. Per-player per-round tracking
-- ---------------------------------------------------------------
create table public.duel_player_rounds (
  id             uuid        not null default gen_random_uuid(),
  duel_id        uuid        not null references public.duels(id) on delete cascade,
  round_number   int         not null,
  user_id        uuid        not null references auth.users(id),
  started_at     timestamptz,
  completed_at   timestamptz,
  guess_count    int         not null default 0,
  time_seconds   int,
  score          int,
  solved         boolean     not null default false,
  constraint duel_player_rounds_pkey primary key (id),
  constraint duel_player_rounds_unique unique (duel_id, round_number, user_id)
);

-- ---------------------------------------------------------------
-- 4. Individual guesses within a duel round
-- ---------------------------------------------------------------
create table public.duel_guesses (
  id           uuid        not null default gen_random_uuid(),
  duel_id      uuid        not null references public.duels(id) on delete cascade,
  round_number int         not null,
  user_id      uuid        not null references auth.users(id),
  position     int         not null,
  unit_name    text        not null,
  feedback     jsonb       not null,
  created_at   timestamptz not null default now(),
  constraint duel_guesses_pkey primary key (id)
);

-- ---------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------
alter table public.duels enable row level security;
alter table public.duel_rounds enable row level security;
alter table public.duel_player_rounds enable row level security;
alter table public.duel_guesses enable row level security;

create policy "Participants read duels"
  on public.duels for select
  using (auth.uid() = challenger_id or auth.uid() = challenged_id);

create policy "Participants read duel rounds"
  on public.duel_rounds for select
  using (
    exists (
      select 1 from public.duels d
      where d.id = duel_id
        and (d.challenger_id = auth.uid() or d.challenged_id = auth.uid())
    )
  );

create policy "Participants read player rounds"
  on public.duel_player_rounds for select
  using (
    exists (
      select 1 from public.duels d
      where d.id = duel_id
        and (d.challenger_id = auth.uid() or d.challenged_id = auth.uid())
    )
  );

-- unit_name is stripped server-side before being sent to the opponent
create policy "Users read own duel guesses"
  on public.duel_guesses for select
  using (auth.uid() = user_id);
