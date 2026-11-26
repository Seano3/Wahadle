import { NextResponse } from "next/server";
import { checkAdmin } from "@/app/lib/admin";
import { createServiceRoleClient } from "@/app/lib/supabase/serviceRole";
import { fetchKdc, buildPlan, applyPlan } from "@/scripts/import/kdcCore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Applies a 40kdc-data import. Rebuilds the plan server-side rather
 * than trusting a plan sent from the browser (a tampered body could
 * otherwise write arbitrary rows); the only input taken is the 40kdc
 * commit sha from the preview, so what's applied matches what the
 * admin saw.
 */
export async function POST(req: Request) {
  const auth = await checkAdmin();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: 403 });
  }

  let sha: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.sha === "string" && /^[0-9a-f]{40}$/.test(body.sha)) sha = body.sha;
  } catch {
    // fall through to the error below
  }
  if (!sha) {
    return NextResponse.json({ error: "Missing 40kdc commit -- run Check for updates first." }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();
    const plan = await buildPlan(supabase, await fetchKdc(sha));
    const logs: string[] = [];
    await applyPlan(supabase, plan, (m) => logs.push(m.trim()));
    return NextResponse.json({ ok: true, logs });
  } catch (err) {
    console.error("POST /api/admin/import/apply failed:", err);
    const message = err instanceof Error ? err.message : "Failed to apply the update.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
