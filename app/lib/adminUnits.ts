import { createClient } from "@/app/lib/supabase/server";

export type ModelLine = {
  line: number;
  name: string | null;
  M: string | null;
  T: string | null;
  Sv: string | null;
  inv_sv: string | null;
  inv_sv_descr: string | null;
  W: string | null;
  Ld: string | null;
  OC: string | null;
  base_size: string | null;
  base_size_descr: string | null;
};

export type CostLine = {
  line: number;
  description: string | null;
  cost: number | null;
};

export type DatasheetDetail = {
  id: string;
  name: string | null;
  factionId: string | null;
  sourceId: string | null;
  legend: string | null;
  role: string | null;
  loadout: string | null;
  transport: string | null;
  virtual: boolean;
  link: string | null;
  modelLines: ModelLine[];
  costLines: CostLine[];
};

export type FactionOption = { id: string; name: string };

/** Fetches every faction for the edit form's faction picker. */
export async function listFactions(): Promise<FactionOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("Factions")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export type DatasheetSummary = {
  id: string;
  name: string;
  faction: string | null;
  modelLineCount: number;
};

/**
 * Lists datasheets (one row per datasheet, NOT per guessable
 * variant) for the admin units list -- the admin edits a whole
 * datasheet's model-lines and cost options together, so the list
 * should show one row per datasheet, unlike the player-facing
 * `units` view which intentionally has one row per variant.
 */
export async function listDatasheets(query?: string): Promise<DatasheetSummary[]> {
  const supabase = await createClient();
  let builder = supabase
    .from("Datasheets")
    .select(`id, name, faction_id, Factions(name), Datasheets_models(line)`)
    .order("name", { ascending: true })
    .limit(100);

  if (query?.trim()) {
    builder = builder.ilike("name", `%${query.trim()}%`);
  }

  const { data, error } = await builder;
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name ?? "(unnamed)",
    faction: row.Factions?.name ?? null,
    modelLineCount: Array.isArray(row.Datasheets_models)
      ? row.Datasheets_models.length
      : 0,
  }));
}

/**
 * Fetches one datasheet plus all of its model-lines and cost-lines
 * for the admin edit form. Unlike the player-facing `units` view
 * (one row per guessable variant), this returns the full set of
 * rows so the admin can edit every model-line and cost option for
 * the datasheet in one screen.
 */
export async function getDatasheetDetail(
  id: string
): Promise<DatasheetDetail | null> {
  const supabase = await createClient();

  const { data: sheet, error: sheetError } = await supabase
    .from("Datasheets")
    .select(
      "id, name, faction_id, source_id, legend, role, loadout, transport, virtual, link"
    )
    .eq("id", id)
    .maybeSingle();

  if (sheetError) throw sheetError;
  if (!sheet) return null;

  const { data: models, error: modelsError } = await supabase
    .from("Datasheets_models")
    .select(
      'line, name, "M", "T", "Sv", inv_sv, inv_sv_descr, "W", "Ld", "OC", base_size, base_size_descr'
    )
    .eq("datasheet_id", id)
    .order("line", { ascending: true });

  if (modelsError) throw modelsError;

  const { data: costs, error: costsError } = await supabase
    .from("Datasheets_models_cost")
    .select("line, description, cost")
    .eq("datasheet_id", id)
    .order("line", { ascending: true });

  if (costsError) throw costsError;

  return {
    id: sheet.id,
    name: sheet.name,
    factionId: sheet.faction_id,
    sourceId: sheet.source_id,
    legend: sheet.legend,
    role: sheet.role,
    loadout: sheet.loadout,
    transport: sheet.transport,
    virtual: sheet.virtual ?? false,
    link: sheet.link,
    modelLines: models ?? [],
    costLines: costs ?? [],
  };
}

export type DatasheetUpdate = {
  name: string;
  factionId: string | null;
  role: string | null;
  legend: string | null;
  loadout: string | null;
  transport: string | null;
  modelLines: ModelLine[];
  costLines: CostLine[];
};

/**
 * Saves edits to a datasheet's own fields plus its full set of
 * model-lines and cost-lines. Runs as a sequence of upserts rather
 * than one big transaction (Supabase's JS client doesn't expose
 * multi-statement transactions directly) -- each step is itself
 * atomic, and the model/cost upserts are idempotent on (datasheet_id,
 * line), so a retry after a partial failure can't duplicate rows.
 *
 * Deleted lines (removed in the form) are NOT automatically
 * deleted here -- see deleteModelLine/deleteCostLine, called
 * explicitly by the form for rows the admin removes, so an
 * accidental empty modelLines array can't wipe a datasheet's
 * stat-lines by mistake.
 */
export async function saveDatasheet(
  id: string,
  update: DatasheetUpdate
): Promise<void> {
  const supabase = await createClient();

  const { error: sheetError } = await supabase
    .from("Datasheets")
    .update({
      name: update.name,
      faction_id: update.factionId,
      role: update.role,
      legend: update.legend,
      loadout: update.loadout,
      transport: update.transport,
    })
    .eq("id", id);

  if (sheetError) throw sheetError;

  if (update.modelLines.length > 0) {
    const { error: modelsError } = await supabase
      .from("Datasheets_models")
      .upsert(
        update.modelLines.map((m) => ({
          datasheet_id: id,
          line: m.line,
          name: m.name,
          M: m.M,
          T: m.T,
          Sv: m.Sv,
          inv_sv: m.inv_sv,
          inv_sv_descr: m.inv_sv_descr,
          W: m.W,
          Ld: m.Ld,
          OC: m.OC,
          base_size: m.base_size,
          base_size_descr: m.base_size_descr,
        })),
        { onConflict: "datasheet_id,line" }
      );
    if (modelsError) throw modelsError;
  }

  if (update.costLines.length > 0) {
    const { error: costsError } = await supabase
      .from("Datasheets_models_cost")
      .upsert(
        update.costLines.map((c) => ({
          datasheet_id: id,
          line: c.line,
          description: c.description,
          cost: c.cost,
        })),
        { onConflict: "datasheet_id,line" }
      );
    if (costsError) throw costsError;
  }
}

export async function deleteModelLine(id: string, line: number): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("Datasheets_models")
    .delete()
    .eq("datasheet_id", id)
    .eq("line", line);
  if (error) throw error;
}

export async function deleteCostLine(id: string, line: number): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("Datasheets_models_cost")
    .delete()
    .eq("datasheet_id", id)
    .eq("line", line);
  if (error) throw error;
}
