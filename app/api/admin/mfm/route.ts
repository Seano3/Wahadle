import { NextResponse } from "next/server";
import { checkAdmin } from "@/app/lib/admin";
import { createServiceRoleClient } from "@/app/lib/supabase/serviceRole";
import { applyMfmImport } from "@/scripts/import/mfmCore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  const auth = await checkAdmin();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: 403 });
  }

  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    const supabase = createServiceRoleClient();
    const result = await applyMfmImport(supabase, log);
    return NextResponse.json({ ok: true, result, logs });
  } catch (err) {
    console.error("POST /api/admin/mfm failed:", err);
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "MFM import failed.";
    return NextResponse.json({ error: message, logs }, { status: 500 });
  }
}
