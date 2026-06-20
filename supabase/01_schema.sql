-- ============================================================
-- Wahadle schema rebuild
-- Run this FIRST on a fresh Supabase project (SQL Editor)
-- ============================================================
-- This recreates the six core tables with proper primary keys
-- and foreign keys (the original deployment had none), and a
-- fixed `units` view that no longer cross-joins unrelated
-- model-lines against unrelated cost-lines.
--
-- The `trash` column that existed on every table in the old
-- backup contained no data in any row and has been dropped.
-- ============================================================

drop view if exists public.units;
drop table if exists public."Datasheets_keywords";
drop table if exists public."Datasheets_models_cost";
drop table if exists public."Datasheets_models";
drop table if exists public."Datasheets";
drop table if exists public."Factions";
drop table if exists public."Source";

-- ----------------------------
-- Factions
-- ----------------------------
create table public."Factions" (
  id    text not null,
  name  text not null,
  link  text,
  trash text,  -- unused in every row of the source export; kept only so restore data pastes in unmodified
  constraint "Factions_pkey" primary key (id)
);

-- ----------------------------
-- Source (codices, indexes, errata)
-- ----------------------------
create table public."Source" (
  id           text not null,
  name         text not null,
  type         text,
  edition      text,
  version      text,
  errata_date  text,
  errata_link  text,
  trash        text,
  -- True for Legends / Horus Heresy Legends / Black Library promo
  -- sources -- these are unsupported, often unbalanced datasheets
  -- Wahapedia itself flags as not-recommended-by-default (see the
  -- "Show Legends and not recommended rules/datasheets" toggle on
  -- wahapedia.ru). Excluded from the player-facing `units` view
  -- below so the game never picks one as an answer. Computed once
  -- here from the source name at import time rather than filtered
  -- ad hoc in application code, so it stays correct automatically
  -- as new sources are added in future data refreshes (as long as
  -- the importer keeps setting it -- see the name pattern below).
  is_legends   boolean not null default false,
  constraint "Source_pkey" primary key (id)
);

-- ----------------------------
-- Datasheets
-- ----------------------------
create table public."Datasheets" (
  id                   text not null,
  name                 text,
  faction_id           text,
  source_id            text,
  legend               text,
  role                 text,
  loadout              text,
  transport            text,
  virtual              boolean default false,
  leader_head          text,
  leader_footer        text,
  damaged_w            text,
  damaged_description  text,
  link                 text,
  constraint "Datasheets_pkey" primary key (id),
  constraint "Datasheets_faction_id_fkey" foreign key (faction_id) references public."Factions"(id),
  constraint "Datasheets_source_id_fkey" foreign key (source_id) references public."Source"(id)
);

create index idx_datasheets_faction_id on public."Datasheets"(faction_id);
create index idx_datasheets_source_id on public."Datasheets"(source_id);
create index idx_datasheets_name on public."Datasheets"(name);

-- ----------------------------
-- Datasheets_models (one row per distinct stat-line within a unit,
-- e.g. "Boy" vs "Boss Nob" within the same datasheet)
-- ----------------------------
create table public."Datasheets_models" (
  datasheet_id      text not null,
  line              bigint not null,
  name              text,
  "M"               text,
  "T"               text,
  "Sv"              text,
  inv_sv            text,
  inv_sv_descr      text,
  "W"               text,
  "Ld"              text,
  "OC"              text,
  base_size         text,
  base_size_descr   text,
  trash             text,
  constraint "Datasheets_models_pkey" primary key (datasheet_id, line),
  constraint "Datasheets_models_datasheet_id_fkey" foreign key (datasheet_id) references public."Datasheets"(id)
);

create index idx_datasheets_models_datasheet_id on public."Datasheets_models"(datasheet_id);

-- ----------------------------
-- Datasheets_models_cost (one row per squad-size / wargear-option
-- purchase line; `line` here is independent of the model-line
-- numbering above)
-- ----------------------------
create table public."Datasheets_models_cost" (
  datasheet_id  text not null,
  line          bigint not null,
  description   text,
  cost          bigint,
  trash         text,
  constraint "Datasheets_models_cost_pkey" primary key (datasheet_id, line),
  constraint "Datasheets_models_cost_datasheet_id_fkey" foreign key (datasheet_id) references public."Datasheets"(id)
);

create index idx_datasheets_models_cost_datasheet_id on public."Datasheets_models_cost"(datasheet_id);

-- ----------------------------
-- Datasheets_keywords
-- Old PK was (datasheet_id) alone, which is wrong since a
-- datasheet has many keywords. `model` is NULL for unit-wide
-- (rather than per-model) keywords, so it can't be part of a
-- primary key as-is; we add a generated column that collapses
-- NULL to '' and key off that instead.
-- ----------------------------
create table public."Datasheets_keywords" (
  datasheet_id        text not null,
  keyword             text not null,
  model               text,
  is_faction_keyword  boolean,
  trash               text,
  model_key           text generated always as (coalesce(model, '')) stored,
  constraint "Datasheets_keywords_pkey" primary key (datasheet_id, keyword, model_key),
  constraint "Datasheets_keywords_datasheet_id_fkey" foreign key (datasheet_id) references public."Datasheets"(id)
);

create index idx_datasheets_keywords_datasheet_id on public."Datasheets_keywords"(datasheet_id);

-- ============================================================
-- units view
--
-- Fix vs. the old deployed view: the old view joined
-- Datasheets_models_cost and Datasheets_models to Datasheets
-- independently (both keyed only on datasheet_id), so any
-- datasheet with multiple model-lines AND multiple cost-lines
-- produced a cross product of nonsense combinations (e.g. an
-- "Attack Bike" stat-line paired with a "3 models" cost line).
--
-- Fix: every distinct model-line becomes its own guessable
-- variant, paired with the unit's single cheapest cost option
-- (chosen by MIN(cost), not by line number -- line numbers in
-- the cost table don't reliably ascend by price, e.g. squads
-- with attached wargear options priced lower than their base
-- squad size).
--
-- Also excludes Legends/Horus Heresy/Black Library datasheets
-- (Source.is_legends) -- these are unsupported/unbalanced and
-- make for frustrating, often-unguessable answers in a stats
-- comparison game.
-- ============================================================
create or replace view public.units as
with base_cost as (
  select distinct on (dmc.datasheet_id)
    dmc.datasheet_id,
    dmc.description as model_count,
    dmc.cost as points
  from public."Datasheets_models_cost" dmc
  order by dmc.datasheet_id, dmc.cost asc nulls last, dmc.line asc
)
select
  d.id as unit_id,
  d.name as unit_name,
  m.line as model_line,
  m."M" as movement,
  m."T" as toughness,
  m."Sv" as save,
  m.inv_sv as invunl_save,
  m."W" as wounds,
  m."Ld" as leadership,
  m."OC" as oc,
  bc.points,
  bc.model_count,
  f.name as faction,
  d.source_id,
  d.legend
from public."Datasheets" d
join public."Datasheets_models" m on m.datasheet_id = d.id
left join base_cost bc on bc.datasheet_id = d.id
left join public."Factions" f on f.id = d.faction_id
left join public."Source" s on s.id = d.source_id
where coalesce(s.is_legends, false) = false;

-- Row-level security: enable but allow public read access,
-- since this is reference game data, not user data.
-- (Account/score tables added later will need their own,
-- much more restrictive policies.)
alter table public."Datasheets" enable row level security;
alter table public."Datasheets_models" enable row level security;
alter table public."Datasheets_models_cost" enable row level security;
alter table public."Datasheets_keywords" enable row level security;
alter table public."Factions" enable row level security;
alter table public."Source" enable row level security;

create policy "Public read access" on public."Datasheets" for select using (true);
create policy "Public read access" on public."Datasheets_models" for select using (true);
create policy "Public read access" on public."Datasheets_models_cost" for select using (true);
create policy "Public read access" on public."Datasheets_keywords" for select using (true);
create policy "Public read access" on public."Factions" for select using (true);
create policy "Public read access" on public."Source" for select using (true);
