import { NextResponse } from "next/server";
import { checkAdmin } from "@/app/lib/admin";
import { createServiceRoleClient } from "@/app/lib/supabase/serviceRole";
import { fetchKdc, buildPlan } from "@/scripts/import/kdcCore";

export const dynamic = "force-dynamic";
// Fetches ~100 JSON files from GitHub, then diffs against the DB.
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Builds a 40kdc-data import plan without writing anything. The
 * response includes the 40kdc commit sha the plan was built from;
 * the apply route takes that sha so it imports exactly the data
 * that was previewed, even if 40kdc pushes a new commit in between.
 */
export async function POST() {
  const auth = await checkAdmin();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: 403 });
  }

  try {
    const kdc = await fetchKdc("main");
    const plan = await buildPlan(createServiceRoleClient(), kdc);
    return NextResponse.json({
      sha: plan.kdc.sha,
      date: plan.kdc.date,
      summary: {
        matched: plan.matched,
        models: plan.models.length,
        costs: plan.costs.length,
        unchangedLegends: plan.unchangedLegends,
        newFactions: plan.newFactions,
        added: plan.added,
        changed: plan.changed,
        matchedLoosely: plan.matchedLoosely,
        frozen: plan.frozen,
        skippedDuplicates: plan.skippedDuplicates,
        softDelete: plan.softDelete,
        hardDelete: plan.hardDelete,
        keptReferencedLines: plan.keptReferencedLines.length,
      },
    });
  } catch (err) {
    console.error("POST /api/admin/import/preview failed:", err);
    const message = err instanceof Error ? err.message : "Failed to check for updates.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
