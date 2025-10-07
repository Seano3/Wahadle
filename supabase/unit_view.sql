-- Flatten datasheets + models + factions into a single view used by the app
create or replace view public.unit_view as
select
  d.id as unit_id,
  d.name as unit_name,
  f.name as faction,
  d.source_id,
  m.m as movement,
  m.t as toughness,
  m.sv as save,
  m.inv_sv as invunl_save,
  m.inv_sv_descr as invunl_save_descr,
  m.w as wounds,
  m.ld as leadership,
  m.oc as oc,
  -- model count: sum of integers found in the corresponding datasheets_models_cost.description
  coalesce(
    (
   select sum((case when t <> '' then t::int else 0 end))
   from public."Datasheets_models_cost" mc,
     regexp_split_to_table(mc.description, '\\D+') as t
   where mc.datasheet_id = d.id
     and mc.line = m.line
    ), 1) as model_count,
  d.link
from public."Datasheets" d
join public."Datasheets_models" m on m.datasheet_id = d.id
left join public."Factions" f on f.id = d.faction_id;

-- Index to speed filtering by source_id
create index if not exists idx_unit_view_source_id on public."Datasheets" (source_id);
