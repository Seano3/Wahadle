-- ============================================================
-- Wahadle: import-safe deletes
-- Run this on the same Supabase project, after 01-04. Safe to
-- run again if needed (idempotent).
-- ============================================================
-- Prepares the schema for repeatable data refreshes (Wahapedia
-- 11th-edition migration and every refresh after it). The
-- refresh policy, per the import script in scripts/import/:
--
--   - Datasheets present in the new export: upsert (insert new,
--     update changed fields).
--   - Datasheets NOT in the new export, and never referenced as
--     a daily_targets or rounds answer: hard-deleted. They were
--     never historically significant, so there's nothing worth
--     keeping.
--   - Datasheets NOT in the new export, but referenced by a past
--     daily_targets or rounds row: soft-deleted instead (flagged
--     `removed = true`, hidden from the `units` view and the
--     admin units list) rather than hard-deleted, so a player
--     looking back at an old shared result ("Wahadle - 4
--     guesses...") doesn't hit a dangling reference, and the
--     historical record of what that day's answer was stays
--     intact.
-- ============================================================

alter table public."Datasheets"
  add column if not exists removed boolean not null default false;

-- The hard-delete path needs child rows to go with the parent --
-- without ON DELETE CASCADE here, deleting a Datasheets row would
-- just fail with a foreign key violation as long as any model-
-- line, cost-line, or keyword row still references it.
alter table public."Datasheets_models"
  drop constraint if exists "Datasheets_models_datasheet_id_fkey",
  add constraint "Datasheets_models_datasheet_id_fkey"
    foreign key (datasheet_id) references public."Datasheets"(id)
    on delete cascade;

alter table public."Datasheets_models_cost"
  drop constraint if exists "Datasheets_models_cost_datasheet_id_fkey",
  add constraint "Datasheets_models_cost_datasheet_id_fkey"
    foreign key (datasheet_id) references public."Datasheets"(id)
    on delete cascade;

alter table public."Datasheets_keywords"
  drop constraint if exists "Datasheets_keywords_datasheet_id_fkey",
  add constraint "Datasheets_keywords_datasheet_id_fkey"
    foreign key (datasheet_id) references public."Datasheets"(id)
    on delete cascade;

-- daily_targets and rounds reference (datasheet_id, line) on
-- Datasheets_models specifically, which is exactly what cascades
-- away under the rule above if a referenced model-line's parent
-- datasheet gets hard-deleted. That's the case the soft-delete
-- path exists to avoid -- the import script (not a DB constraint)
-- is responsible for checking daily_targets/rounds BEFORE issuing
-- any delete, and choosing removed=true instead of DELETE for
-- those specific datasheets. See scripts/import/refresh.ts.

-- ----------------------------
-- units view: also exclude soft-deleted datasheets, on top of
-- the existing is_legends filter from 04_exclude_legends.sql.
-- ----------------------------
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
where coalesce(s.is_legends, false) = false
  and d.removed = false;
