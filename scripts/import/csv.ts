import fs from "node:fs";

/**
 * Parses a Wahapedia export file: pipe-delimited, UTF-8, with a
 * BOM on the first line in practice. Returns an array of objects
 * keyed by the header row.
 *
 * This is intentionally a hand-rolled parser, not a general CSV
 * library: Wahapedia's "csv" files use `|` as the delimiter and
 * have no quoting/escaping convention at all (fields containing
 * literal `|` don't appear to occur in practice, but if one ever
 * does, it will silently misalign columns -- there's no way to
 * detect that from the file alone, so this is a known sharp edge,
 * not a bug to "fix"). See README in this directory.
 */
export function parsePipeDelimited(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  // Strip a leading BOM if present (Wahapedia files include one).
  const text = raw.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const header = lines[0].split("|").map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split("|");
    const row: Record<string, string> = {};
    header.forEach((col, idx) => {
      row[col] = fields[idx] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

/** Converts an empty string (Wahapedia's representation of NULL) to null. */
export function emptyToNull(v: string | undefined): string | null {
  if (v === undefined) return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

/** Parses Wahapedia's "true"/"false" text into an actual boolean. */
export function parseBool(v: string | undefined): boolean {
  return (v ?? "").trim().toLowerCase() === "true";
}

/** Parses a numeric field, returning null for empty/non-numeric values. */
export function parseIntOrNull(v: string | undefined): number | null {
  const cleaned = emptyToNull(v);
  if (cleaned === null) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
