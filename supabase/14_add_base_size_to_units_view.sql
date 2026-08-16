-- Adds base_size (Datasheets_models.base_size) to the units view so the
-- game can show/compare base sizes. The raw text (e.g. "40mm", "120 x
-- 92mm", "Use model") is exposed as-is; area-derivation for gameplay
-- comparison happens client-side in app/lib/units.ts.
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
WHERE COALESCE(s.is_legends, false) = false;
