import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";
import { createServiceRoleClient } from "@/app/lib/supabase/serviceRole";

export const dynamic = "force-dynamic";

// GET /api/duel
// Returns all pending + active duels for the current user.
export async function GET() {
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const srv = createServiceRoleClient();

    const { data: duels, error } = await srv
      .from("duels")
      .select("id, challenger_id, challenged_id, status, expires_at, created_at")
      .or(`challenger_id.eq.${user.id},challenged_id.eq.${user.id}`)
      .in("status", ["pending", "active"])
      .order("created_at", { ascending: false });

    if (error) throw error;

    const allUserIds = [
      ...new Set((duels ?? []).flatMap((d) => [d.challenger_id, d.challenged_id])),
    ];

    let nameMap: Record<string, string> = {};
    if (allUserIds.length > 0) {
      const { data: profiles } = await srv
        .from("profiles")
        .select("id, display_name")
        .in("id", allUserIds);
      for (const p of profiles ?? []) {
        nameMap[p.id] = p.display_name ?? "Unknown";
      }
    }

    const result = (duels ?? []).map((d) => ({
      id: d.id,
      status: d.status,
      challengerName: nameMap[d.challenger_id] ?? "Unknown",
      challengedName: nameMap[d.challenged_id] ?? "Unknown",
      opponentName:
        d.challenger_id === user.id
          ? (nameMap[d.challenged_id] ?? "Unknown")
          : (nameMap[d.challenger_id] ?? "Unknown"),
      amChallenger: d.challenger_id === user.id,
      expiresAt: d.expires_at,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/duel failed:", err);
    return NextResponse.json({ error: "Failed to load duels." }, { status: 500 });
  }
}

// POST /api/duel
// Body: { challengedId: string }
// Creates a pending duel invite. Both players must be friends.
export async function POST(req: Request) {
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const { challengedId } = await req.json();
    if (!challengedId?.trim()) {
      return NextResponse.json({ error: "Missing challengedId." }, { status: 400 });
    }
    if (challengedId === user.id) {
      return NextResponse.json({ error: "You can't duel yourself." }, { status: 400 });
    }

    const srv = createServiceRoleClient();

    // Verify friendship
    const { data: friendship } = await srv
      .from("friend_requests")
      .select("id")
      .or(
        `and(from_user.eq.${user.id},to_user.eq.${challengedId}),and(from_user.eq.${challengedId},to_user.eq.${user.id})`
      )
      .eq("status", "accepted")
      .maybeSingle();

    if (!friendship) {
      return NextResponse.json({ error: "You can only duel friends." }, { status: 403 });
    }

    // Check for an existing pending or active duel between these two
    const { data: existing } = await srv
      .from("duels")
      .select("id, status")
      .or(
        `and(challenger_id.eq.${user.id},challenged_id.eq.${challengedId}),and(challenger_id.eq.${challengedId},challenged_id.eq.${user.id})`
      )
      .in("status", ["pending", "active"])
      .maybeSingle();

    if (existing) {
      const msg =
        existing.status === "active"
          ? "You already have an active duel with this player."
          : "You already have a pending duel invite with this player.";
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    const { data: duel, error: insertError } = await srv
      .from("duels")
      .insert({ challenger_id: user.id, challenged_id: challengedId })
      .select("id")
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({ ok: true, duelId: duel.id });
  } catch (err) {
    console.error("POST /api/duel failed:", err);
    return NextResponse.json({ error: "Failed to create duel." }, { status: 500 });
  }
}
