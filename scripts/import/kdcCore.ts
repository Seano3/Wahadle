/**
 * 40kdc-data importer core (github.com/wn-mitch/40kdc-data, CC BY 4.0).
 *
 * Replaces the Wahapedia CSV + MFM pipeline. The key design rule is
 * that EXISTING WAHADLE IDS ARE KEPT: every past game (daily_targets,
 * rounds, game_guesses, duel_rounds) points at a Wahapedia-style
 * datasheet id plus a model line, so each 40kdc unit is mapped onto
 * the existing datasheet with the same name in the same faction, and
 * each 40kdc profile onto the existing model line with the same name.
 * Only genuinely new units get new ids.
 *
 * Other rules:
 *  - Matching is strictly same-faction. Cross-faction "fallback"
 *    matching is what caused the shared-datasheet MFM points bug.
 *  - Ally copies (e.g. Genestealer Cults copies of Astra Militarum
 *    tanks) aren't in 40kdc, so they drop out like any other removed
 *    datasheet: hidden (removed = true) if a past game references
 *    them, deleted otherwise.
 *  - Legends datasheets (Source.is_legends) are left untouched.
 *  - Datasheets that are today's (or a future) daily answer are
 *    "frozen": kept, but their stats/points aren't changed, so the
 *    answer doesn't shift under players mid-day. Re-run tomorrow to
 *    pick up their new values.
 *  - Where 40kdc has no usable value (aircraft Movement, flying /
 *    hull bases marked draft, a known oval->round base error) the
 *    existing Wahapedia value is kept.
 *  - Only name / faction / removed are written on Datasheets; the
 *    Wahapedia prose columns on existing rows are left alone.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const REPO = "wn-mitch/40kdc-data";

// ---------------------------------------------------------------
// 40kdc types (only the fields we use)
// ---------------------------------------------------------------

type BaseSize = {
  shape: "round" | "oval" | "flying-base" | "hull" | "unique";
  diameter?: number;
  width?: number;
  length?: number;
  draft?: boolean;
};

type KdcProfile = {
  name?: string;
  M: number | string | object | null;
  T: number;
  W: number;
  Sv: number;
  invuln_sv: number | null;
  invuln_sv_ranged?: number | null;
  invuln_sv_melee?: number | null;
  Ld: number;
  OC: number;
};

type KdcUnit = {
  id: string;
  name: string;
  faction_id: string;
  profiles: KdcProfile[];
  points?: { models: number; cost: number; models_max?: number }[];
  base_size_mm?: BaseSize | null;
  game_modes?: string[];
  is_legend?: boolean;
};

type KdcComposition = {
  unit_id: string;
  faction_id?: string;
  models: { name: string; base_size_mm?: BaseSize | null }[];
};

type KdcFaction = { id: string; name: string; aliases?: string[]; parent_faction_id?: string | null };

export type KdcDataset = {
  sha: string;
  date: string;
  units: KdcUnit[];
  /** keyed `${faction_id}/${unit_id}` -- 40kdc unit ids repeat across factions */
  compositions: Map<string, KdcComposition>;
  factions: Map<string, KdcFaction>;
};

// ---------------------------------------------------------------
// DB row types
// ---------------------------------------------------------------

type ModelRow = {
  datasheet_id: string;
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
};

type CostRow = { datasheet_id: string; line: number; description: string | null; cost: number | null };

type DatasheetRow = {
  id: string;
  name: string | null;
  faction_id: string | null;
  source_id: string | null;
  removed: boolean;
};

// ---------------------------------------------------------------
// helpers
// ---------------------------------------------------------------

export function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'‘`]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Looser key for a second matching pass: "Vypers" ~ "Vyper", "Blight-hauler" ~ "Blight-haulers". */
function loose(s: string | null | undefined): string {
  return norm(s)
    .split(" ")
    .map((w) => w.replace(/s$/, ""))
    .join(" ");
}

function isMatchedPlay(u: KdcUnit): boolean {
  return !u.game_modes || u.game_modes.includes("matched-play");
}

function dims(text: string | null): number[] {
  return (text?.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

function formatBase(b: BaseSize | null | undefined, existing: string | null): string | null {
  const usable = b && !b.draft && (b.shape === "round" || b.shape === "oval");
  if (!usable) {
    if (existing) return existing;
    if (b && (b.shape === "hull" || b.shape === "unique")) return "Use model";
    return null;
  }
  if (b.shape === "round") {
    // Known 40kdc error: some oval bases (Warbuggies 150 x 95mm,
    // Wazdakka 120 x 92mm) are recorded as round with the long axis
    // as the diameter. Keep the existing oval when that's the case.
    const ex = dims(existing);
    if (ex.length === 2 && ex[0] === b.diameter) return existing;
    return `${b.diameter}mm`;
  }
  const [a, c] = [b.width!, b.length!].sort((x, y) => y - x);
  return `${a} x ${c}mm`;
}

function formatMove(m: KdcProfile["M"], existing: string | null): string | null {
  if (typeof m === "number") return `${m}"`;
  if (typeof m === "string") return m;
  // null (aircraft) or a dice expression object: keep what we had.
  return existing;
}

function invuln(p: KdcProfile): { inv_sv: string | null; inv_sv_descr: string | null } {
  if (p.invuln_sv != null) return { inv_sv: String(p.invuln_sv), inv_sv_descr: null };
  if (p.invuln_sv_ranged != null)
    return { inv_sv: String(p.invuln_sv_ranged), inv_sv_descr: "* Against ranged attacks only" };
  if (p.invuln_sv_melee != null)
    return { inv_sv: String(p.invuln_sv_melee), inv_sv_descr: "* Against melee attacks only" };
  return { inv_sv: null, inv_sv_descr: null };
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function fetchAllRows<T>(supabase: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw error;
    all.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return all;
}

// ---------------------------------------------------------------
// fetch 40kdc
// ---------------------------------------------------------------

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

function asArray<T>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : [];
}

export async function fetchKdc(ref = "main"): Promise<KdcDataset> {
  const gh: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) gh.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const commit = await fetchJson<{ sha: string; commit: { committer: { date: string } } }>(
    `https://api.github.com/repos/${REPO}/commits/${ref}`,
    gh
  );
  if (!commit) throw new Error(`40kdc-data ref "${ref}" not found`);
  const sha = commit.sha;

  const listing = await fetchJson<{ name: string; type: string }[]>(
    `https://api.github.com/repos/${REPO}/contents/data/core?ref=${sha}`,
    gh
  );
  if (!listing) throw new Error("Could not list data/core in 40kdc-data");
  const dirs = listing.filter((e) => e.type === "dir" && !e.name.startsWith("_")).map((e) => e.name);
  const raw = (dir: string, file: string) =>
    `https://raw.githubusercontent.com/${REPO}/${sha}/data/core/${dir}/${file}`;

  const units: KdcUnit[] = [];
  const compositions = new Map<string, KdcComposition>();
  const factions = new Map<string, KdcFaction>();

  const queue = [...dirs];
  async function worker() {
    for (let dir = queue.shift(); dir; dir = queue.shift()) {
      const [u, c, f] = await Promise.all([
        fetchJson<unknown>(raw(dir, "units.json")),
        fetchJson<unknown>(raw(dir, "unit-compositions.json")),
        fetchJson<unknown>(raw(dir, "factions.json")),
      ]);
      units.push(...asArray<KdcUnit>(u));
      for (const comp of asArray<KdcComposition>(c))
        compositions.set(`${comp.faction_id ?? dir}/${comp.unit_id}`, comp);
      for (const fac of asArray<KdcFaction>(f)) factions.set(fac.id, fac);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));

  if (units.length < 500) throw new Error(`Only ${units.length} units fetched from 40kdc -- refusing to import`);
  return { sha, date: commit.commit.committer.date, units, compositions, factions };
}

// ---------------------------------------------------------------
// plan
// ---------------------------------------------------------------

/** 40kdc factions Wahadle doesn't have yet. */
const NEW_FACTIONS: Record<string, { id: string; name: string }> = {
  "titanicus-traitoris": { id: "TT", name: "Titanicus Traitoris" },
};

type Entry = { id: string; name: string | null; faction: string };

export type ImportPlan = {
  kdc: { sha: string; date: string };
  newFactions: { id: string; name: string }[];
  datasheets: { id: string; name: string; faction_id: string; removed: false }[];
  models: ModelRow[];
  costs: CostRow[];
  /** Existing cost lines to delete (replaced by the new ones). */
  staleCostIds: string[];
  /** Existing model lines no longer present, safe to delete. */
  staleModelLines: { datasheet_id: string; line: number }[];
  /** Existing model lines no longer in 40kdc but referenced by a past game -- kept, stats refreshed. */
  keptReferencedLines: { datasheet_id: string; line: number; name: string | null }[];
  matched: number;
  matchedLoosely: Entry[];
  added: Entry[];
  skippedDuplicates: Entry[];
  /** Existing units whose stats, base or points will change. */
  changed: Entry[];
  frozen: Entry[];
  softDelete: Entry[];
  hardDelete: Entry[];
  unchangedLegends: number;
};

export async function buildPlan(supabase: SupabaseClient, kdc: KdcDataset): Promise<ImportPlan> {
  const [factionRows, sourceRows, sheetRows, modelRows, costRows] = await Promise.all([
    fetchAllRows<{ id: string; name: string }>(supabase, "Factions", "id, name"),
    fetchAllRows<{ id: string; is_legends: boolean }>(supabase, "Source", "id, is_legends"),
    fetchAllRows<DatasheetRow>(supabase, "Datasheets", "id, name, faction_id, source_id, removed"),
    fetchAllRows<ModelRow>(
      supabase,
      "Datasheets_models",
      'datasheet_id, line, name, "M", "T", "Sv", inv_sv, inv_sv_descr, "W", "Ld", "OC", base_size'
    ),
    fetchAllRows<CostRow>(supabase, "Datasheets_models_cost", "datasheet_id, line, description, cost"),
  ]);

  // ---- references from past/current games ----
  const refRows = (
    await Promise.all(
      ["daily_targets", "rounds", "duel_rounds"].map((t) =>
        fetchAllRows<{ unit_id: string; model_line: number }>(supabase, t, "unit_id, model_line")
      )
    )
  ).flat();
  const referencedSheets = new Set(refRows.map((r) => r.unit_id));
  const referencedLines = new Set(refRows.map((r) => `${r.unit_id}::${r.model_line}`));

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const { data: dailyNow, error: dailyErr } = await supabase
    .from("daily_targets")
    .select("unit_id")
    .gte("play_date", today);
  if (dailyErr) throw dailyErr;
  const frozenIds = new Set((dailyNow ?? []).map((d) => d.unit_id as string));

  // ---- faction mapping: 40kdc faction id -> Wahadle faction id ----
  const wFactionByName = new Map(factionRows.map((f) => [norm(f.name), f.id]));
  const factionName = new Map(factionRows.map((f) => [f.id, f.name]));
  const newFactions: { id: string; name: string }[] = [];
  const mapFaction = (kid: string): string => {
    const f = kdc.factions.get(kid);
    if (!f) throw new Error(`40kdc unit references unknown faction "${kid}"`);
    if (f.parent_faction_id) return mapFaction(f.parent_faction_id); // chapters -> Space Marines
    for (const n of [f.name, ...(f.aliases ?? [])]) {
      const hit = wFactionByName.get(norm(n));
      if (hit) return hit;
    }
    const nf = NEW_FACTIONS[kid];
    if (nf) {
      if (!newFactions.some((x) => x.id === nf.id)) newFactions.push(nf);
      factionName.set(nf.id, nf.name);
      return nf.id;
    }
    throw new Error(`No Wahadle faction for 40kdc faction "${f.name}" -- add it to NEW_FACTIONS`);
  };

  // ---- existing datasheets available for matching ----
  const legendsSources = new Set(sourceRows.filter((s) => s.is_legends).map((s) => s.id));
  const isLegends = (d: DatasheetRow) => d.source_id != null && legendsSources.has(d.source_id);
  const candidates = sheetRows.filter((d) => !isLegends(d));
  const unusedByKey = (keyFn: (s: string | null) => string) => {
    const m = new Map<string, DatasheetRow[]>();
    for (const d of candidates) {
      const k = `${d.faction_id}|${keyFn(d.name)}`;
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return m;
  };
  const exact = unusedByKey(norm);
  const loosely = unusedByKey(loose);
  const used = new Set<string>();
  const take = (m: Map<string, DatasheetRow[]>, key: string): DatasheetRow | undefined => {
    // Prefer a live row over a soft-deleted one, then the oldest id
    // (Wahapedia's Black Templars copies of SM vehicles came later).
    const list = (m.get(key) ?? [])
      .filter((d) => !used.has(d.id))
      .sort((a, b) => Number(a.removed) - Number(b.removed) || a.id.localeCompare(b.id));
    const hit = list[0];
    if (hit) used.add(hit.id);
    return hit;
  };

  const modelsBySheet = new Map<string, ModelRow[]>();
  for (const m of modelRows) modelsBySheet.set(m.datasheet_id, [...(modelsBySheet.get(m.datasheet_id) ?? []), m]);
  const costsBySheet = new Map<string, CostRow[]>();
  for (const c of costRows) costsBySheet.set(c.datasheet_id, [...(costsBySheet.get(c.datasheet_id) ?? []), c]);

  // New ids continue Wahapedia's sequence, below the 99xxxxxxx placeholder block.
  let nextId = Math.max(0, ...sheetRows.map((d) => Number(d.id)).filter((n) => Number.isFinite(n) && n < 900_000_000)) + 1;
  const newId = () => String(nextId++).padStart(9, "0");

  // ---- 40kdc units to import ----
  const playable = kdc.units.filter((u) => isMatchedPlay(u) && !u.is_legend && u.profiles.length > 0);
  // Same name in the same (mapped) faction => keep one. This catches
  // the Black Templars copies of Gladiators/Repulsors/Impulsor, which
  // collapse onto the Space Marines versions once chapters map to SM.
  // Prefer the id without a faction suffix (the "base" version).
  playable.sort((a, b) => a.id.length - b.id.length);

  const plan: ImportPlan = {
    kdc: { sha: kdc.sha, date: kdc.date },
    newFactions,
    datasheets: [],
    models: [],
    costs: [],
    staleCostIds: [],
    staleModelLines: [],
    keptReferencedLines: [],
    matched: 0,
    matchedLoosely: [],
    added: [],
    skippedDuplicates: [],
    changed: [],
    frozen: [],
    softDelete: [],
    hardDelete: [],
    unchangedLegends: sheetRows.filter(isLegends).length,
  };

  const seenNameFaction = new Set<string>();
  const pending: { u: KdcUnit; fid: string }[] = [];
  for (const u of playable) {
    const fid = mapFaction(u.faction_id);
    const key = `${fid}|${norm(u.name)}`;
    if (seenNameFaction.has(key)) {
      plan.skippedDuplicates.push({ id: `${u.faction_id}/${u.id}`, name: u.name, faction: factionName.get(fid)! });
      continue;
    }
    seenNameFaction.add(key);
    pending.push({ u, fid });
  }

  // Exact-name pass for everything first, then the loose pass, so a
  // loose match can never steal a row another unit matches exactly.
  const matchOf = new Map<KdcUnit, DatasheetRow>();
  for (const { u, fid } of pending) {
    const hit = take(exact, `${fid}|${norm(u.name)}`);
    if (hit) matchOf.set(u, hit);
  }
  for (const { u, fid } of pending) {
    if (matchOf.has(u)) continue;
    const hit = take(loosely, `${fid}|${loose(u.name)}`);
    if (hit) {
      matchOf.set(u, hit);
      plan.matchedLoosely.push({ id: hit.id, name: `${hit.name} -> ${u.name}`, faction: factionName.get(fid)! });
    }
  }

  for (const { u, fid } of pending) {
    const existing = matchOf.get(u);
    const id = existing?.id ?? newId();
    if (existing) plan.matched++;
    else plan.added.push({ id, name: u.name, faction: factionName.get(fid)! });

    plan.datasheets.push({ id, name: u.name, faction_id: fid, removed: false });

    if (frozenIds.has(id)) {
      plan.frozen.push({ id, name: u.name, faction: factionName.get(fid)! });
      continue; // keep today's answer exactly as players have been seeing it
    }

    // ---- model lines ----
    const oldLines = modelsBySheet.get(id) ?? [];
    const comp = kdc.compositions.get(`${u.faction_id}/${u.id}`);
    const usedLines = new Set<number>();
    let nextLine = Math.max(0, ...oldLines.map((l) => l.line)) + 1;

    // Pass 1: exact profile-name matches claim their old lines first,
    // so a fallback in pass 2 can't steal a line another profile owns.
    const pname = (p: KdcProfile) => p.name ?? u.name;
    const oldFor = new Map<number, ModelRow | undefined>();
    u.profiles.forEach((p, idx) => {
      const hit = oldLines.find((l) => !usedLines.has(l.line) && norm(l.name) === norm(pname(p)));
      if (hit) {
        usedLines.add(hit.line);
        oldFor.set(idx, hit);
      }
    });
    // Pass 2: everything else.
    u.profiles.forEach((p, idx) => {
      if (oldFor.has(idx)) return;
      const free = oldLines.filter((l) => !usedLines.has(l.line)).sort((a, b) => a.line - b.line);
      const hit =
        // Same number of lines: pair by position.
        (oldLines.length === u.profiles.length ? free.find((l) => l.line === idx + 1) : undefined) ??
        // Otherwise reuse a leftover line (one a past game points at
        // first), so e.g. Wahapedia's "Reiver Sergeant" line 1 becomes
        // 40kdc's single "Reivers" profile rather than a stale extra.
        free.find((l) => referencedLines.has(`${id}::${l.line}`)) ??
        free[0];
      if (hit) usedLines.add(hit.line);
      oldFor.set(idx, hit);
    });

    u.profiles.forEach((p, idx) => {
      const old = oldFor.get(idx);
      const line = old?.line ?? (oldLines.length === 0 ? idx + 1 : nextLine++);
      usedLines.add(line);
      const name = pname(p);

      const modelBase =
        comp?.models.find((m) => norm(m.name) === norm(name))?.base_size_mm ??
        (u.profiles.length === 1 && comp?.models.length === 1 ? comp.models[0].base_size_mm : undefined) ??
        u.base_size_mm;

      plan.models.push({
        datasheet_id: id,
        line,
        name,
        M: formatMove(p.M, old?.M ?? null),
        T: String(p.T),
        Sv: `${p.Sv}+`,
        ...invuln(p),
        W: String(p.W),
        Ld: `${p.Ld}+`,
        OC: String(p.OC),
        base_size: formatBase(modelBase, old?.base_size ?? null),
      });
    });

    for (const l of oldLines) {
      if (usedLines.has(l.line)) continue;
      if (referencedLines.has(`${id}::${l.line}`)) {
        // A past game points at this line, so it can't be deleted.
        // Keep its name but refresh its stats from the closest current
        // profile (by name, else the first), so it isn't left with
        // out-of-date Wahapedia numbers.
        plan.keptReferencedLines.push({ datasheet_id: id, line: l.line, name: l.name });
        const source =
          plan.models.find((m) => m.datasheet_id === id && norm(l.name).includes(norm(m.name))) ??
          plan.models.find((m) => m.datasheet_id === id)!;
        plan.models.push({ ...source, line: l.line, name: l.name, base_size: source.base_size ?? l.base_size });
      } else plan.staleModelLines.push({ datasheet_id: id, line: l.line });
    }

    // ---- points ----
    // If 40kdc has no real price (e.g. Sir Hekhtur at 0), keep the old one.
    const tiers = (u.points ?? []).filter((t) => t.cost > 0);
    if (tiers.length > 0 && costsBySheet.has(id)) plan.staleCostIds.push(id);
    tiers.forEach((t, i) =>
        plan.costs.push({
          datasheet_id: id,
          line: i,
          description: `${t.models} model${t.models === 1 ? "" : "s"}`,
          cost: t.cost,
        })
      );

    if (existing) {
      const statKey = (m: ModelRow) =>
        [m.line, m.M, m.T, m.Sv, m.inv_sv, m.W, m.Ld, m.OC, m.base_size].join("|");
      const minCost = (cs: CostRow[]) => Math.min(...cs.map((c) => c.cost ?? Infinity));
      const before = oldLines.map(statKey).sort().join(";");
      const after = plan.models.filter((m) => m.datasheet_id === id).map(statKey).sort().join(";");
      const pointsChanged = tiers.length > 0 && minCost(costsBySheet.get(id) ?? []) !== Math.min(...tiers.map((t) => t.cost));
      if (before !== after || pointsChanged || existing.name !== u.name || existing.removed)
        plan.changed.push({ id, name: u.name, faction: factionName.get(fid)! });
    }
  }

  // ---- removals ----
  const kept = new Set(plan.datasheets.map((d) => d.id));
  for (const d of candidates) {
    if (kept.has(d.id)) continue;
    const e = { id: d.id, name: d.name, faction: factionName.get(d.faction_id ?? "") ?? d.faction_id ?? "" };
    if (frozenIds.has(d.id)) throw new Error(`Today's daily answer ${d.id} (${d.name}) has no 40kdc match -- refusing to remove it`);
    if (referencedSheets.has(d.id)) {
      if (!d.removed) plan.softDelete.push(e);
    } else plan.hardDelete.push(e);
  }

  return plan;
}

// ---------------------------------------------------------------
// apply
// ---------------------------------------------------------------

async function upsert(supabase: SupabaseClient, table: string, rows: object[], onConflict: string) {
  for (const batch of chunk(rows, 200)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

export async function applyPlan(supabase: SupabaseClient, plan: ImportPlan, log = console.log) {
  if (plan.newFactions.length) await upsert(supabase, "Factions", plan.newFactions, "id");
  log(`  factions: +${plan.newFactions.length}`);

  await upsert(supabase, "Datasheets", plan.datasheets, "id");
  log(`  datasheets upserted: ${plan.datasheets.length}`);

  await upsert(supabase, "Datasheets_models", plan.models, "datasheet_id,line");
  for (const l of plan.staleModelLines) {
    const { error } = await supabase
      .from("Datasheets_models")
      .delete()
      .eq("datasheet_id", l.datasheet_id)
      .eq("line", l.line);
    if (error) throw new Error(`Deleting stale model line ${l.datasheet_id}::${l.line} failed: ${error.message}`);
  }
  log(`  model lines upserted: ${plan.models.length}, stale removed: ${plan.staleModelLines.length}`);

  // Points: replace each datasheet's cost lines wholesale. Nothing
  // references cost lines, and leftover old lines would win the
  // view's "cheapest line" pick.
  for (const ids of chunk(plan.staleCostIds, 100)) {
    const { error } = await supabase.from("Datasheets_models_cost").delete().in("datasheet_id", ids);
    if (error) throw new Error(`Clearing old cost lines failed: ${error.message}`);
  }
  await upsert(supabase, "Datasheets_models_cost", plan.costs, "datasheet_id,line");
  log(`  cost lines written: ${plan.costs.length}`);

  for (const ids of chunk(plan.softDelete.map((d) => d.id), 100)) {
    const { error } = await supabase.from("Datasheets").update({ removed: true }).in("id", ids);
    if (error) throw new Error(`Soft delete failed: ${error.message}`);
  }
  log(`  hidden (referenced by past games): ${plan.softDelete.length}`);

  for (const ids of chunk(plan.hardDelete.map((d) => d.id), 100)) {
    const { error } = await supabase.from("Datasheets").delete().in("id", ids);
    if (error) throw new Error(`Delete failed: ${error.message}`);
  }
  log(`  deleted: ${plan.hardDelete.length}`);
}

/** Snapshot of everything applyPlan can touch, so a bad import can be rolled back by hand. */
export async function backupTables(supabase: SupabaseClient) {
  const [Factions, Datasheets, Datasheets_models, Datasheets_models_cost] = await Promise.all([
    fetchAllRows(supabase, "Factions", "*"),
    fetchAllRows(supabase, "Datasheets", "*"),
    fetchAllRows(supabase, "Datasheets_models", "*"),
    fetchAllRows(supabase, "Datasheets_models_cost", "*"),
  ]);
  return { Factions, Datasheets, Datasheets_models, Datasheets_models_cost };
}
