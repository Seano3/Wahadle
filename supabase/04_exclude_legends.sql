-- ============================================================
-- Wahadle: exclude Legends datasheets
-- Run this on the same Supabase project, after 01_schema.sql,
-- 02_daily_targets.sql, 03_search_and_admin.sql, and the data
-- restore. Safe to run again if needed (idempotent).
-- ============================================================
-- Legends / Horus Heresy Legends / Black Library promo datasheets
-- are unsupported, often unbalanced, and make for frustrating
-- answers in a stats-comparison game -- Wahapedia itself hides
-- them by default (the "Show Legends and not recommended rules/
-- datasheets" toggle on wahapedia.ru). This excludes them from
-- the `units` view so the game never picks one as an answer.
--
-- The flag is set by matching Source.name rather than a hardcoded
-- list of source ids, so it keeps working automatically as new
-- Legends supplements are added in future Wahapedia data refreshes
-- -- as long as whatever process loads new Source rows re-runs the
-- update below (or this whole file) afterward.
-- ============================================================

alter table public."Source"
  add column if not exists is_legends boolean not null default false;

update public."Source"
set is_legends = true
where name ilike '%legends%' or name ilike 'black library%';

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

-- Sanity check: should show roughly 535 fewer datasheets excluded
-- (1,634 total minus Legends-sourced ones, as of the 10th-edition
-- restored dataset). Run this after the migration to confirm:
--
--   select count(*) from public."Source" where is_legends = true;
--   -- expect 29
--
--   select count(distinct unit_id) from public.units;
--   -- expect roughly 1,099 (1,634 minus ~535 Legends datasheets,
--   -- give or take the handful with no model-line at all)
