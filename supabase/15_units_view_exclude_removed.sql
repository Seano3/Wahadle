-- Restores the soft-delete filter on the units view.
--
-- 05_import_safe_deletes.sql made the view hide datasheets flagged
-- `removed = true` (dropped from the data source but kept because a
-- past game references them). 14_add_base_size_to_units_view.sql
-- rebuilt the view from 08's definition and lost that filter, so
-- hidden units -- e.g. the ally duplicates the 40kdc import hides --
-- were still guessable and could be picked as answers.
--
-- Note: getUnitByVariant also reads this view, so a past daily or
-- endless round whose answer is now hidden can no longer be
-- re-judged. That's the intended 05 behaviour: getDailyUnit only
-- re-resolves TODAY's target, and the 40kdc importer refuses to hide
-- today's (or a future) answer.
CREATE OR REPLACE VIEW public.units AS
WITH base_cost AS (
  SELECT DISTINCT ON (dmc.datasheet_id)
    dmc.datasheet_id,
    dmc.description AS model_count,
    dmc.cost AS points
  FROM public."Datasheets_models_cost" dmc
  ORDER BY dmc.datasheet_id, dmc.cost ASC NULLS LAST, dmc.line ASC
)
SELECT
  d.id         AS unit_id,
  d.name       AS unit_name,
  m.line       AS model_line,
  m."M"        AS movement,
  m."T"        AS toughness,
  m."Sv"       AS save,
  m.inv_sv     AS invunl_save,
  m."W"        AS wounds,
  m."Ld"       AS leadership,
  m."OC"       AS oc,
  bc.points,
  bc.model_count,
  f.name       AS faction,
  d.source_id,
  d.legend,
  m.name       AS model_name,
  m.base_size  AS base_size
FROM public."Datasheets" d
JOIN public."Datasheets_models" m ON m.datasheet_id = d.id
LEFT JOIN base_cost bc ON bc.datasheet_id = d.id
LEFT JOIN public."Factions" f ON f.id = d.faction_id
LEFT JOIN public."Source" s ON s.id = d.source_id
WHERE COALESCE(s.is_legends, false) = false
  AND d.removed = false;
