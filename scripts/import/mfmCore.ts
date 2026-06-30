import type { SupabaseClient } from "@supabase/supabase-js";

const MFM_BASE = "https://mfm.warhammer-community.com";

const FACTION_SLUGS = [
  "adepta-sororitas",
  "adeptus-custodes",
  "adeptus-mechanicus",
  "aeldari",
  "astra-militarum",
  "black-templars",
  "blood-angels",
  "chaos-daemons",
  "chaos-knights",
  "chaos-space-marines",
  "chaos-titan-legions",
  "dark-angels",
  "death-guard",
  "deathwatch",
  "drukhari",
  "emperors-children",
  "genestealer-cults",
  "grey-knights",
  "imperial-agents",
  "imperial-knights",
  "leagues-of-votann",
  "necrons",
  "orks",
  "space-marines",
  "space-wolves",
  "tau-empire",
  "thousand-sons",
  "titan-legions",
  "tyranids",
  "world-eaters",
];

// Section headings that appear with the same styling as unit names but aren't units.
const SKIP_HEADERS = new Set([
  "DETACHMENTS",
  "UNITS",
  "LEADERS",
  "ENHANCEMENTS",
  "LEADER",
  "SUPPORT",
]);

async function fetchFactionRsc(slug: string): Promise<string> {
  const res = await fetch(`${MFM_BASE}/en/${slug}`, {
    headers: {
      // The MFM site returns 403 for requests without a real browser
      // User-Agent. No other auth is needed — a UA header is enough.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      // Request the Next.js RSC (React Server Components) payload,
      // which is a flat line-oriented stream where each unit card is
      // self-contained. Much easier to parse than rendered HTML.
      Accept: "text/x-component",
      RSC: "1",
    },
  });
  if (!res.ok) {
    throw new Error(`MFM fetch failed for ${slug}: HTTP ${res.status}`);
  }
  return res.text();
}

/**
 * Parses a single faction's RSC payload and returns a map of
 * unit name (ALL CAPS, as the MFM renders it) → minimum points cost.
 *
 * The RSC stream is a line-oriented format where each line is:
 *   hexId:jsonValue
 *
 * Points spans are pre-defined as labeled entries ("$L{id}" refs)
 * and then referenced inline inside unit card JSON. We build a map
 * of label → pts first, then scan each unit card to resolve refs
 * and take the minimum cost (= cheapest unit size, 1st-unit tier).
 */
type UnitCost = { cost: number; description: string | null };

function parseFactionUnits(rscContent: string): Map<string, UnitCost> {
  const lines = rscContent.split("\n");

  // Pass 1: build label map (hexId → raw JSON value string)
  const labelMap = new Map<string, string>();
  for (const line of lines) {
    const m = line.match(/^([0-9a-f]+):(.+)$/);
    if (m) labelMap.set(m[1], m[2]);
  }

  // Pass 2: find all pts-span labels (hexId → integer points)
  // Titan Legions use comma-formatted values like "2,200 pts", so
  // the pattern allows commas and strips them before parsing.
  const ptsMap = new Map<string, number>();
  for (const [id, val] of labelMap) {
    const m = val.match(/"children":"([\d,]+) pts"/);
    if (m) ptsMap.set(id, parseInt(m[1].replace(/,/g, ""), 10));
  }

  // Unit header pattern: the specific Tailwind class string used for
  // every unit name heading on the MFM.
  const unitPat =
    /"px-1 py-0\.5 bg-slate-500 dark:bg-slate-800 font-bold text-xl text-white","children":"([^"]+)"/g;

  // Match only $L refs that are genuine unit-cost rows.
  //
  // Unit cost rows have this structure in the RSC stream:
  //   ["$","span",null,{"children":[false,"N model(s)"]}],"$Lhex"
  //
  // Wargear/upgrade cost rows look like this instead:
  //   ["$","span",null,{"children":"per Acid spray"}],"$Lhex"
  //
  // The key difference: unit costs use [false,"desc"] or
  // ["$undefined","desc"] as the span's children (an array), while
  // wargear costs use a plain string. Matching [false,/\$undefined]
  // means we never accidentally pick up a weapon upgrade cost and
  // mistake it for the unit cost (which happened with e.g. Tyrannofex,
  // where a "per Acid spray": 10 pts upgrade made the unit appear as
  // 10 pts instead of its real 180 pts).
  //
  // The pattern matches the tail of the li element:
  //   "children":[false,"desc"]}],"$Lhex"
  //      ↑children array  ↑}closes span props  ↑]closes span element
  // Capture group 1 = description text (e.g. "5 models"), group 2 = pts $L ref.
  const unitCostRefPat =
    /"children":\[(?:false|"\$undefined"),"([^"]*)"\]\}\],"\$L([0-9a-f]+)"/g;

  const units = new Map<string, UnitCost>(); // unit name → { cost, description }

  for (const line of lines) {
    // Collect all unit header matches in this line
    const unitMatches: { index: number; name: string }[] = [];
    unitPat.lastIndex = 0;
    let um: RegExpExecArray | null;
    while ((um = unitPat.exec(line)) !== null) {
      unitMatches.push({ index: um.index, name: um[1] });
    }

    for (let i = 0; i < unitMatches.length; i++) {
      const { index: start, name } = unitMatches[i];
      if (SKIP_HEADERS.has(name)) continue;

      // Slice the chunk belonging to this unit card (up to the next
      // unit header in the same line, or end of line)
      const end =
        i + 1 < unitMatches.length ? unitMatches[i + 1].index : line.length;
      const chunk = line.slice(start, end);

      // Resolve all unit-cost $L refs and find the minimum.
      unitCostRefPat.lastIndex = 0;
      let minCost: number | null = null;
      let minDesc: string | null = null;
      let ref: RegExpExecArray | null;
      while ((ref = unitCostRefPat.exec(chunk)) !== null) {
        const desc = ref[1] || null;
        const pts = ptsMap.get(ref[2]);
        if (pts !== undefined && (minCost === null || pts < minCost)) {
          minCost = pts;
          minDesc = desc;
        }
      }

      // First occurrence wins — the same unit can appear in both the
      // UNITS section and the LEADERS section of the same page.
      if (minCost !== null && !units.has(name)) {
        units.set(name, { cost: minCost, description: minDesc });
      }
    }
  }

  return units;
}

/**
 * Fetches all 30 MFM faction pages and returns a combined map of
 * unit name (ALL CAPS) → minimum points cost.
 *
 * Failures on individual factions are logged and skipped rather than
 * crashing the entire import — a single faction page being temporarily
 * unavailable shouldn't block the rest.
 */
export async function fetchAllMfmCosts(
  log: (msg: string) => void = console.log
): Promise<Map<string, UnitCost>> {
  const combined = new Map<string, UnitCost>();

  for (const slug of FACTION_SLUGS) {
    try {
      const rsc = await fetchFactionRsc(slug);
      const units = parseFactionUnits(rsc);
      let added = 0;
      for (const [name, entry] of units) {
        if (!combined.has(name)) {
          combined.set(name, entry);
          added++;
        }
      }
      log(`  ${slug}: ${added} units`);
    } catch (err) {
      log(
        `  ${slug}: FAILED — ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return combined;
}

export type MfmImportResult = {
  totalMfmUnits: number;
  matched: number;
  unmatched: { name: string; cost: number }[];
};

/**
 * Fetches all MFM costs, matches them to Wahapedia datasheet IDs by
 * name (case-insensitive), then for each matched datasheet:
 *   1. Deletes all existing Datasheets_models_cost rows
 *   2. Inserts one new row with the MFM minimum cost
 *
 * This should be run AFTER a Wahapedia import, since a Wahapedia
 * refresh will re-populate Datasheets_models_cost with its own values
 * and overwrite anything written here.
 */
export async function applyMfmImport(
  supabase: SupabaseClient,
  log: (msg: string) => void = console.log
): Promise<MfmImportResult> {
  log("Fetching MFM data from mfm.warhammer-community.com...");
  const mfmCosts = await fetchAllMfmCosts(log);
  log(`Total MFM units found: ${mfmCosts.size}`);

  // Load all non-removed datasheets
  const PAGE_SIZE = 1000;
  const allDatasheets: { id: string; name: string | null }[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("Datasheets")
      .select("id, name")
      .eq("removed", false)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    allDatasheets.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // Build a normalized name → datasheet id lookup
  const nameToId = new Map<string, string>();
  for (const ds of allDatasheets) {
    if (ds.name) nameToId.set(ds.name.toUpperCase(), ds.id);
  }

  // Match MFM unit names to datasheet ids
  const toUpdate: { datasheetId: string; cost: number; description: string | null }[] = [];
  const unmatched: { name: string; cost: number }[] = [];

  for (const [mfmName, { cost, description }] of mfmCosts) {
    const id = nameToId.get(mfmName);
    if (id) {
      toUpdate.push({ datasheetId: id, cost, description });
    } else {
      unmatched.push({ name: mfmName, cost });
    }
  }

  log(`Matched: ${toUpdate.length} / Unmatched: ${unmatched.length}`);
  if (unmatched.length > 0) {
    log(`Unmatched units (logged for reference):`);
    for (const { name } of unmatched) log(`  - ${name}`);
  }

  // Apply in batches: delete existing cost rows, insert one MFM row
  const BATCH = 50;
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const batch = toUpdate.slice(i, i + BATCH);
    const ids = batch.map((r) => r.datasheetId);

    // Preserve the description (e.g. "5 models") from the cheapest
    // existing row per datasheet before we delete them.
    const { data: existingRows, error: fetchErr } = await supabase
      .from("Datasheets_models_cost")
      .select("datasheet_id, description, cost")
      .in("datasheet_id", ids)
      .order("cost", { ascending: true, nullsFirst: false });
    if (fetchErr) throw fetchErr;

    const descMap = new Map<string, string | null>();
    for (const row of existingRows ?? []) {
      if (!descMap.has(row.datasheet_id)) {
        descMap.set(row.datasheet_id, row.description);
      }
    }

    const { error: delErr } = await supabase
      .from("Datasheets_models_cost")
      .delete()
      .in("datasheet_id", ids);
    if (delErr) throw delErr;

    const rows = batch.map((r) => ({
      datasheet_id: r.datasheetId,
      line: 0,
      description: r.description ?? descMap.get(r.datasheetId) ?? null,
      cost: r.cost,
    }));
    const { error: insErr } = await supabase
      .from("Datasheets_models_cost")
      .insert(rows);
    if (insErr) throw insErr;
  }

  return {
    totalMfmUnits: mfmCosts.size,
    matched: toUpdate.length,
    unmatched,
  };
}
