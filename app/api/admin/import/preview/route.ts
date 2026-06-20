import { NextResponse } from "next/server";
import { checkAdmin } from "@/app/lib/admin";
import { createServiceRoleClient } from "@/app/lib/supabase/serviceRole";
import { fetchExportFiles, parseExport, computeDiff } from "@/scripts/import/core";

export const dynamic = "force-dynamic";
// Server-only fetch to wahapedia.ru -- this needs the Node.js
// runtime (not Edge), which doesn't have the network access this
// route requires.
export const runtime = "nodejs";
// Diffing ~1,600+ datasheets against 6 export files, each fetched
// over the network, is the slow part of this feature. Give it
// more headroom than the default; if your hosting plan caps
// function duration below this, the CLI script (scripts/import/
// refresh.ts) is the fallback -- see its file header comment.
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await checkAdmin();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: 403 });
  }

  let edition = "wh40k10ed";
  try {
    const body = await req.json();
    if (typeof body?.edition === "string" && body.edition.trim()) {
      edition = body.edition.trim();
    }
  } catch {
    // No body / invalid JSON -- fall back to the default edition.
  }

  try {
    const files = await fetchExportFiles(edition);
    const parsed = parseExport(files);
    const supabase = createServiceRoleClient();
    const diff = await computeDiff(supabase, parsed);

    return NextResponse.json({ edition, diff });
  } catch (err) {
    console.error("POST /api/admin/import/preview failed:", err);
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to check for updates.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
