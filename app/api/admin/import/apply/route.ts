import { NextResponse } from "next/server";
import { checkAdmin } from "@/app/lib/admin";
import { createServiceRoleClient } from "@/app/lib/supabase/serviceRole";
import { fetchExportFiles, parseExport, applyImport } from "@/scripts/import/core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
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
    // Re-fetches and re-parses rather than trusting a diff payload
    // from the browser, even though that means doing the network
    // round-trip twice (once for the preview the admin already
    // saw, once here) -- this is a write operation, and trusting
    // client-supplied data for what rows to upsert/delete would
    // mean a tampered request body could apply something other
    // than what was actually previewed.
    const files = await fetchExportFiles(edition);
    const parsed = parseExport(files);
    const supabase = createServiceRoleClient();
    await applyImport(supabase, parsed);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/admin/import/apply failed:", err);
    // Supabase/PostgREST errors are plain objects with code/message/
    // details/hint, NOT real Error instances, so `err instanceof
    // Error` is false for them and a naive fallback would discard
    // the actually-useful Postgres message. Surface it directly --
    // see upsertInBatches in core.ts for the additional diagnostic
    // logging (which table, which row) this triggers server-side
    // for code 21000 specifically.
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to apply the update.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
