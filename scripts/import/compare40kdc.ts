/**
 * Read-only comparison: Wahadle's current `units` view vs the
 * 40kdc-data community dataset (github.com/wn-mitch/40kdc-data).
 *
 * Purpose: decide whether 40kdc-data is good enough to replace the
 * Wahapedia CSV + MFM import pipeline. This script writes NOTHING to
 * the database -- it reads the `units` view with the anon key, pulls
 * 40kdc's per-faction JSON straight from GitHub, matches units by
 * name, and writes a report of matches, gaps and stat disagreements.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *     npx tsx scripts/import/compare40kdc.ts [--ref main] [--out ./compare-40kdc-report]
 *
 * Optional: GITHUB_TOKEN raises the GitHub API rate limit (only one
 * API call is made, to list factions; the data files come from
 * raw.githubusercontent.com, which isn't API-rate-limited).
 *
 * Output (in --out):
 *   report.md        summary + per-field disagreement tables
 *   mismatches.csv   every field-level disagreement, one per line
 *   unmatched.csv    Wahadle units with no 40kdc match, and vice versa
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const REPO = "wn-mitch/40kdc-data";

// ---------- args / env ----------

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function requireEnv(...names: string[]): string {
  for (const n of names) if (process.env[n]) return process.env[n]!;
  console.error(`Missing required environment variable: ${names.join(" or ")}`);
  process.exit(1);
}

// ---------- 40kdc types (only the fields we use) ----------

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
  /** Attack-scoped invulns (e.g. Knights' ranged-only 5+). Wahapedia folds these into its single inv column. */
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
  model_count?: { min: number; max: number };
  game_modes?: string[];
  is_legend?: boolean;
};

type KdcComposition = {
  unit_id: string;
  models: { name: string; base_size_mm?: BaseSize | null }[];
};

type KdcFaction = { id: string; name: string; aliases?: string[] };

// ---------- Wahadle row (raw `units` view) ----------

type ViewRow = {
  unit_id: string;
  unit_name: string | null;
  model_line: number;
  model_name: string | null;
  movement: string | null;
  toughness: string | null;
  save: string | null;
  invunl_save: string | null;
  wounds: string | null;
  leadership: string | null;
  oc: string | null;
  base_size: string | null;
  points: number | null;
  model_count: string | null;
  faction: string | null;
};

// ---------- helpers ----------

/** Lowercase, strip diacritics/apostrophes/punctuation, collapse spaces. */
function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'‘`]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Same as app/lib/units.ts toNum. */
function toNum(x: string | null): number | null {
  if (x == null) return null;
  const m = /(-?\d+(?:\.\d+)?)/.exec(x);
  return m ? Number(m[1]) : null;
}

/** Same as app/lib/units.ts parseBaseArea. */
function wahadleBaseArea(text: string | null): number | null {
  if (!text) return null;
  const d = text.match(/\d+(?:\.\d+)?/g);
  if (!d || d.length === 0) return null;
  const [d1, d2 = d1] = d;
  return Math.round(Math.PI * (Number(d1) / 2) * (Number(d2) / 2));
}

/** Same as app/lib/units.ts parseModelCount. */
function wahadleModelCount(text: string | null): number | null {
  if (!text) return null;
  const n = text.match(/\d+/g);
  if (!n) return null;
  const total = n.reduce((s, x) => s + Number(x), 0);
  return total > 0 ? total : null;
}

function kdcBaseArea(b: BaseSize | null | undefined): number | null {
  if (!b || b.draft) return null;
  if (b.shape === "round" && b.diameter) return Math.round(Math.PI * (b.diameter / 2) ** 2);
  if (b.shape === "oval" && b.width && b.length)
    return Math.round(Math.PI * (b.width / 2) * (b.length / 2));
  return null;
}

function kdcBaseLabel(b: BaseSize | null | undefined): string {
  if (!b) return "";
  const dims =
    b.shape === "round" ? `${b.diameter}mm` : b.shape === "oval" ? `${b.width} x ${b.length}mm` : b.shape;
  return b.draft ? `${dims} (draft)` : dims;
}

function kdcMove(m: KdcProfile["M"]): number | null {
  if (m == null) return null;
  if (typeof m === "number") return m;
  return toNum(typeof m === "string" ? m : JSON.stringify(m));
}

function isMatchedPlay(u: KdcUnit): boolean {
  return !u.game_modes || u.game_modes.includes("matched-play");
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------- fetching ----------

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

/** 40kdc files are top-level arrays; tolerate a single-key wrapper object just in case. */
function asArray<T>(x: unknown): T[] {
  if (Array.isArray(x)) return x as T[];
  if (x && typeof x === "object") {
    const vals = Object.values(x);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0] as T[];
  }
  return [];
}

async function load40kdc(ref: string) {
  const ghHeaders: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) ghHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const commit = await fetchJson<{ sha: string; commit: { committer: { date: string } } }>(
    `https://api.github.com/repos/${REPO}/commits/${ref}`,
    ghHeaders
  );
  const sha = commit?.sha ?? ref;

  const listing = await fetchJson<{ name: string; type: string }[]>(
    `https://api.github.com/repos/${REPO}/contents/data/core?ref=${sha}`,
    ghHeaders
  );
  if (!listing) throw new Error("Could not list data/core in 40kdc-data");
  const dirs = listing.filter((e) => e.type === "dir" && !e.name.startsWith("_")).map((e) => e.name);

  const raw = (dir: string, file: string) =>
    `https://raw.githubusercontent.com/${REPO}/${sha}/data/core/${dir}/${file}`;

  const units: KdcUnit[] = [];
  const compositions = new Map<string, KdcComposition>();
  const factions = new Map<string, KdcFaction>();

  // Small concurrency limit to be polite to GitHub.
  const queue = [...dirs];
  async function worker() {
    for (let dir = queue.shift(); dir; dir = queue.shift()) {
      const [u, c, f] = await Promise.all([
        fetchJson<unknown>(raw(dir, "units.json")),
        fetchJson<unknown>(raw(dir, "unit-compositions.json")),
        fetchJson<unknown>(raw(dir, "factions.json")),
      ]);
      units.push(...asArray<KdcUnit>(u));
      for (const comp of asArray<KdcComposition>(c)) compositions.set(comp.unit_id, comp);
      for (const fac of asArray<KdcFaction>(f)) factions.set(fac.id, fac);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));

  return { sha, date: commit?.commit.committer.date ?? "", factionDirs: dirs.length, units, compositions, factions };
}

async function loadWahadle(): Promise<ViewRow[]> {
  const url = requireEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const rows: ViewRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("units")
      .select("*")
      .not("unit_name", "is", null)
      .order("unit_id", { ascending: true })
      .order("model_line", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as ViewRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

// ---------- comparison ----------

const FIELDS = ["M", "T", "Sv", "Inv", "W", "Ld", "OC", "Base area", "Points", "Model count"] as const;
type Field = (typeof FIELDS)[number];

type Mismatch = {
  wahadleId: string;
  unit: string;
  faction: string;
  modelLine: number;
  modelName: string;
  kdcId: string;
  kdcFaction: string;
  /** False when no same-faction 40kdc unit existed and we fell back to another faction's copy. */
  sameFaction: boolean;
  field: Field;
  wahadle: string | number | null;
  kdc: string | number | null;
};

async function main() {
  const ref = arg("--ref", "main");
  const outDir = arg("--out", "./compare-40kdc-report");

  console.log(`Loading 40kdc-data @ ${ref} ...`);
  const kdc = await load40kdc(ref);
  console.log(`  ${kdc.units.length} units across ${kdc.factionDirs} faction folders (commit ${kdc.sha.slice(0, 7)})`);

  console.log("Loading Wahadle units view ...");
  const rows = await loadWahadle();
  console.log(`  ${rows.length} model-line rows`);

  // Faction names/aliases -> faction id, so Wahapedia's "Space Marines"
  // lines up with 40kdc's "adeptus-astartes" (alias "Space Marines").
  const factionIdByName = new Map<string, string>();
  for (const f of kdc.factions.values()) {
    factionIdByName.set(norm(f.name), f.id);
    factionIdByName.set(norm(f.id), f.id);
    for (const a of f.aliases ?? []) factionIdByName.set(norm(a), f.id);
  }

  const kdcPlayable = kdc.units.filter((u) => isMatchedPlay(u) && !u.is_legend);
  const kdcByName = new Map<string, KdcUnit[]>();
  for (const u of kdcPlayable) {
    const k = norm(u.name);
    kdcByName.set(k, [...(kdcByName.get(k) ?? []), u]);
  }

  // Group Wahadle rows by datasheet.
  const sheets = new Map<string, ViewRow[]>();
  for (const r of rows) sheets.set(r.unit_id, [...(sheets.get(r.unit_id) ?? []), r]);

  const mismatches: Mismatch[] = [];
  const compared: Record<Field, number> = Object.fromEntries(FIELDS.map((f) => [f, 0])) as Record<Field, number>;
  const kdcMissingValue: Record<Field, number> = { ...compared };
  const unmatchedWahadle: ViewRow[] = [];
  const usedKdc = new Set<string>();
  let factionDiffers = 0;
  let lineCountDiffers = 0;
  let matchedSheets = 0;

  for (const [, lines] of sheets) {
    const first = lines[0];
    const candidates = kdcByName.get(norm(first.unit_name)) ?? [];
    if (candidates.length === 0) {
      unmatchedWahadle.push(first);
      continue;
    }
    const wantFaction = factionIdByName.get(norm(first.faction));
    const unit = candidates.find((c) => c.faction_id === wantFaction) ?? candidates[0];
    if (unit.faction_id !== wantFaction) factionDiffers++;
    usedKdc.add(unit.id);
    matchedSheets++;
    if (unit.profiles.length !== lines.length) lineCountDiffers++;

    const comp = kdc.compositions.get(unit.id);
    const minPoints = unit.points?.length ? Math.min(...unit.points.map((p) => p.cost)) : null;

    lines.forEach((row, idx) => {
      // Pair Wahadle model line -> 40kdc profile: by name, else by position.
      const profile =
        unit.profiles.find((p) => p.name && norm(p.name) === norm(row.model_name)) ??
        (unit.profiles.length === 1 ? unit.profiles[0] : unit.profiles[idx]);
      const compModel = comp?.models.find((m) => norm(m.name) === norm(row.model_name ?? profile?.name));
      const kdcBase = compModel?.base_size_mm ?? unit.base_size_mm;

      const pairs: [Field, number | null, number | null, (string | number | null)?, (string | number | null)?][] = [
        ["M", toNum(row.movement), profile ? kdcMove(profile.M) : null],
        ["T", toNum(row.toughness), profile?.T ?? null],
        ["Sv", toNum(row.save), profile?.Sv ?? null],
        ["Inv", toNum(row.invunl_save), profile?.invuln_sv ?? profile?.invuln_sv_ranged ?? profile?.invuln_sv_melee ?? null],
        ["W", toNum(row.wounds), profile?.W ?? null],
        ["Ld", toNum(row.leadership), profile?.Ld ?? null],
        ["OC", toNum(row.oc), profile?.OC ?? null],
        [
          "Base area",
          wahadleBaseArea(row.base_size),
          kdcBaseArea(kdcBase),
          row.base_size ?? "",
          kdcBaseLabel(kdcBase),
        ],
        ["Points", row.points, minPoints],
        [
          "Model count",
          wahadleModelCount(row.model_count),
          unit.model_count?.min ?? null,
          row.model_count ?? "",
          unit.model_count ? `${unit.model_count.min}-${unit.model_count.max}` : "",
        ],
      ];

      for (const [field, w, k, wLabel, kLabel] of pairs) {
        // Points / model count are per-datasheet; only count them once.
        if ((field === "Points" || field === "Model count") && idx > 0) continue;
        // Inv: null on both sides is a legitimate match (no invuln).
        if (field !== "Inv" && w == null && k == null) continue;
        compared[field]++;
        if (field !== "Inv" && k == null) {
          kdcMissingValue[field]++;
        }
        // Base area: small rounding differences (e.g. 25 vs 25.4mm) aren't real disagreements.
        const equal =
          w === k || (field === "Base area" && w != null && k != null && Math.abs(w - k) / Math.max(w, k) < 0.05);
        if (!equal) {
          mismatches.push({
            wahadleId: row.unit_id,
            unit: row.unit_name ?? "",
            faction: row.faction ?? "",
            modelLine: row.model_line,
            modelName: row.model_name ?? "",
            kdcId: unit.id,
            kdcFaction: kdc.factions.get(unit.faction_id)?.name ?? unit.faction_id,
            sameFaction: unit.faction_id === wantFaction,
            field,
            wahadle: wLabel !== undefined && wLabel !== "" ? `${w ?? "—"} (${wLabel})` : w,
            kdc: kLabel !== undefined && kLabel !== "" ? `${k ?? "—"} (${kLabel})` : k,
          });
        }
      }
    });
  }

  const unmatchedKdc = kdcPlayable.filter((u) => !usedKdc.has(u.id));

  // ---------- write report ----------

  fs.mkdirSync(outDir, { recursive: true });

  const mismatchCsv = [
    "wahadle_id,unit,faction,model_line,model_name,kdc_id,kdc_faction,same_faction,field,wahadle,kdc",
    ...mismatches.map((m) =>
      [m.wahadleId, m.unit, m.faction, m.modelLine, m.modelName, m.kdcId, m.kdcFaction, m.sameFaction, m.field, m.wahadle, m.kdc]
        .map(csvCell)
        .join(",")
    ),
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "mismatches.csv"), mismatchCsv + "\n");

  const unmatchedCsv = [
    "side,id,name,faction",
    ...unmatchedWahadle.map((r) => ["wahadle_only", r.unit_id, r.unit_name, r.faction].map(csvCell).join(",")),
    ...unmatchedKdc.map((u) =>
      ["40kdc_only", u.id, u.name, kdc.factions.get(u.faction_id)?.name ?? u.faction_id].map(csvCell).join(",")
    ),
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "unmatched.csv"), unmatchedCsv + "\n");

  const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "—");
  const byField = (f: Field) => mismatches.filter((m) => m.field === f);

  const md: string[] = [];
  md.push(`# Wahadle vs 40kdc-data comparison`, "");
  md.push(`- 40kdc-data commit: \`${kdc.sha}\` (${kdc.date})`);
  md.push(`- Generated: ${new Date().toISOString()}`, "");
  md.push(`## Coverage`, "");
  md.push(`| | Count |`, `|---|---|`);
  md.push(`| Wahadle datasheets | ${sheets.size} |`);
  md.push(`| 40kdc matched-play, non-legend units | ${kdcPlayable.length} |`);
  md.push(`| Matched by name | ${matchedSheets} (${pct(matchedSheets, sheets.size)} of Wahadle) |`);
  md.push(`| Wahadle only (no 40kdc unit with that name) | ${unmatchedWahadle.length} |`);
  md.push(`| 40kdc only (no Wahadle datasheet with that name) | ${unmatchedKdc.length} |`);
  md.push(`| Matched, but faction differs | ${factionDiffers} |`);
  md.push(`| Matched, but number of stat lines differs | ${lineCountDiffers} |`, "");
  md.push(`## Field agreement (matched units)`, "");
  md.push(`| Field | Compared | Disagree | 40kdc has no value | Agreement |`, `|---|---|---|---|---|`);
  for (const f of FIELDS) {
    const d = byField(f).length;
    md.push(`| ${f} | ${compared[f]} | ${d} | ${kdcMissingValue[f]} | ${pct(compared[f] - d, compared[f])} |`);
  }
  md.push(
    "",
    "Base area uses the same formula as the game (`app/lib/units.ts`) and allows a 5% tolerance. ",
    "40kdc base sizes marked `draft` (flying bases, hulls) count as \"no value\".",
    ""
  );

  for (const f of FIELDS) {
    const list = byField(f);
    if (list.length === 0) continue;
    md.push(`## ${f} disagreements (${list.length})`, "");
    md.push(`| Unit | Model | Faction | Wahadle | 40kdc |`, `|---|---|---|---|---|`);
    // Same-faction disagreements first: cross-faction fallbacks are expected to differ more.
    const sorted = [...list].sort((a, b) => Number(b.sameFaction) - Number(a.sameFaction));
    for (const m of sorted.slice(0, 100)) {
      const fac = m.sameFaction ? m.faction : `${m.faction} (vs 40kdc ${m.kdcFaction})`;
      md.push(`| ${m.unit} | ${m.modelName} | ${fac} | ${m.wahadle ?? "—"} | ${m.kdc ?? "—"} |`);
    }
    if (list.length > 100) md.push(``, `…and ${list.length - 100} more in mismatches.csv`);
    md.push("");
  }

  fs.writeFileSync(path.join(outDir, "report.md"), md.join("\n"));

  // ---------- console summary ----------

  console.log(`\nMatched ${matchedSheets}/${sheets.size} Wahadle datasheets (${pct(matchedSheets, sheets.size)})`);
  console.log(`  Wahadle only: ${unmatchedWahadle.length}   40kdc only: ${unmatchedKdc.length}`);
  console.log(`\nField agreement:`);
  for (const f of FIELDS) {
    const d = byField(f).length;
    console.log(
      `  ${f.padEnd(12)} ${pct(compared[f] - d, compared[f]).padStart(6)}  (${d} disagree, ${kdcMissingValue[f]} missing in 40kdc, of ${compared[f]})`
    );
  }
  console.log(`\nReport written to ${path.resolve(outDir)}/report.md`);
}

main().catch((err) => {
  console.error("Comparison failed:", err);
  process.exit(1);
});
