-- Flatten datasheets + models + factions into a single view used by the app
create or replace view public.units as
select
  d.id as unit_id,
  d.name as unit_name,
  m."M" as movement,
  m."T" as toughness,
  m."Sv" as save,
  m.inv_sv as invunl_save,
  m."W" as wounds,
  m."Ld" as leadership,
  m."OC" as oc,
  dmc."cost" as points, 
  dmc."description" as Model_Count,
  f.name as faction,
  d.source_id
from public."Datasheets" d
join public."Datasheets_models" m on m.datasheet_id = d.id
left join public."Factions" f on f.id = d.faction_id
left join public."Datasheets_models_cost" dmc on dmc.datasheet_id = d.id and dmc.line = m.line::text;

-- Index to speed filtering by source_id
create index if not exists idx_unit_view_source_id on public."Datasheets" (source_id);
