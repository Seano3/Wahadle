import { NextResponse } from "next/server";
import { checkAdmin } from "@/app/lib/admin";
import { createDatasheet } from "@/app/lib/adminUnits";

export const dynamic = "force-dynamic";

// Words that stay lowercase when in the middle of a title,
// matching the convention used by Wahapedia (e.g. "Captain in
// Terminator Armour", "Champion of Chaos", "Squad with Jump Packs").
const LOWERCASE_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "if", "in",
  "nor", "of", "on", "or", "so", "the", "to", "up", "yet", "with",
]);

function toTitleCase(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word, i) => {
      const capitalize = (w: string) =>
        w.charAt(0).toUpperCase() + w.slice(1);
      // Hyphenated words: capitalize each segment ("Blight-Haulers")
      const titled = word.includes("-")
        ? word.split("-").map(capitalize).join("-")
        : capitalize(word);
      // First word is always capitalized; small words elsewhere are not
      return i === 0 || !LOWERCASE_WORDS.has(word) ? titled : word;
    })
    .join(" ");
}

export async function POST(req: Request) {
  const auth = await checkAdmin();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: 403 });
  }

  try {
    const body = await req.json();
    const name = typeof body?.name === "string" ? toTitleCase(body.name) : "";
    const cost = typeof body?.cost === "number" ? body.cost : null;

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }
    if (cost === null || !Number.isInteger(cost) || cost < 0) {
      return NextResponse.json({ error: "Cost must be a non-negative integer." }, { status: 400 });
    }

    const id = await createDatasheet(name, cost);
    return NextResponse.json({ id });
  } catch (err) {
    console.error("POST /api/admin/units failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to create unit.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
