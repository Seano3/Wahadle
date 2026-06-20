import { NextResponse } from "next/server";
import { startRound } from "@/app/lib/units";

// Touches cookies (via the Supabase server client), so this can
// never be statically rendered -- declaring it explicitly avoids
// a noisy build-time warning and documents the reason.
export const dynamic = "force-dynamic";

/**
 * Starts a new endless round and returns ONLY its round id. The
 * target's identity is never sent to the client -- see
 * supabase/02_daily_targets.sql for why a select policy alone
 * doesn't protect this, and app/api/guess/endless/route.ts for
 * where the real boundary is enforced (the response shape).
 */
export async function GET() {
  try {
    const roundId = await startRound("endless");
    return NextResponse.json({ roundId });
  } catch (err) {
    console.error("GET /api/endless failed:", err);
    return NextResponse.json(
      { error: "Failed to start a new round." },
      { status: 500 }
    );
  }
}
