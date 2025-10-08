-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.Datasheets (
  id text NOT NULL,
  name text,
  faction_id text,
  source_id text,
  legend text,
  role text,
  loadout text,
  transport text,
  virtual text,
  leader_head text,
  leader_footer text,
  damaged_w text,
  damaged_description text,
  link text,
  CONSTRAINT Datasheets_pkey PRIMARY KEY (id),
  CONSTRAINT Datasheets_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.Source(id),
  CONSTRAINT Datasheets_faction_id_fkey FOREIGN KEY (faction_id) REFERENCES public.Factions(id)
);
CREATE TABLE public.Datasheets_keywords (
  datasheet_id text NOT NULL,
  keyword text NOT NULL,
  model text,
  is_faction_keyword boolean,
  trash text,
  CONSTRAINT Datasheets_keywords_pkey PRIMARY KEY (datasheet_id),
  CONSTRAINT Datasheets_keywords_datasheet_id_fkey FOREIGN KEY (datasheet_id) REFERENCES public.Datasheets(id)
);
CREATE TABLE public.Datasheets_models (
  datasheet_id text NOT NULL,
  line bigint NOT NULL,
  name text,
  M text,
  T text,
  Sv text,
  inv_sv text,
  inv_sv_descr text,
  W text,
  Ld text,
  OC text,
  base_size text,
  base_size_descr text,
  trash text,
  CONSTRAINT Datasheets_models_pkey PRIMARY KEY (line, datasheet_id),
  CONSTRAINT Datasheet_models_datasheet_id_fkey FOREIGN KEY (datasheet_id) REFERENCES public.Datasheets(id)
);
CREATE TABLE public.Datasheets_models_cost (
  datasheet_id text NOT NULL,
  line text NOT NULL,
  description text,
  cost bigint,
  trash text,
  CONSTRAINT Datasheets_models_cost_pkey PRIMARY KEY (datasheet_id, line),
  CONSTRAINT Datasheets_models_cost_datasheet_id_fkey FOREIGN KEY (datasheet_id) REFERENCES public.Datasheets(id)
);
CREATE TABLE public.Factions (
  id text NOT NULL,
  name text NOT NULL,
  link text,
  trash text,
  CONSTRAINT Factions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.Source (
  id text NOT NULL,
  name text NOT NULL,
  type text,
  edition text,
  version text,
  errata_date text,
  errata_link text,
  trash text,
  CONSTRAINT Source_pkey PRIMARY KEY (id)
);