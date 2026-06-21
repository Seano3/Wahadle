import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/friends
// Returns { friends, incoming, outgoing } where each entry includes
// the other user's display_name and the request id.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const { data, error } = await supabase
      .from("friend_requests")
      .select("id, from_user, to_user, status, created_at")
      .or(`from_user.eq.${user.id},to_user.eq.${user.id}`);

    if (error) throw error;

    // Collect all peer user IDs so we can fetch their display names in one query.
    const peerIds = [...new Set(
      (data ?? []).map((r) => r.from_user === user.id ? r.to_user : r.from_user)
    )];

    let nameMap: Record<string, string> = {};
    if (peerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", peerIds);
      for (const p of profiles ?? []) {
        nameMap[p.id] = p.display_name ?? "Unknown";
      }
    }

    const friends: { id: string; displayName: string; userId: string }[] = [];
    const incoming: { id: string; displayName: string; userId: string }[] = [];
    const outgoing: { id: string; displayName: string; userId: string }[] = [];

    for (const r of data ?? []) {
      const peerId = r.from_user === user.id ? r.to_user : r.from_user;
      const entry = { id: r.id, displayName: nameMap[peerId] ?? "Unknown", userId: peerId };
      if (r.status === "accepted") {
        friends.push(entry);
      } else if (r.status === "pending") {
        if (r.to_user === user.id) incoming.push(entry);
        else outgoing.push(entry);
      }
    }

    return NextResponse.json({ friends, incoming, outgoing });
  } catch (err) {
    console.error("GET /api/friends failed:", err);
    return NextResponse.json({ error: "Failed to load friends." }, { status: 500 });
  }
}

// POST /api/friends
// Body: { displayName: string }
// Looks up the user with that display name and creates a pending request.
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const { displayName } = await req.json();
    if (!displayName?.trim()) {
      return NextResponse.json({ error: "Display name is required." }, { status: 400 });
    }

    // Escape ILIKE wildcards so partial patterns can't enumerate accounts.
    const safeName = displayName.trim().replace(/%/g, "\\%").replace(/_/g, "\\_");

    // Find the target profile by display_name (case-insensitive exact match).
    const { data: target, error: lookupError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .ilike("display_name", safeName)
      .single();

    if (lookupError || !target) {
      return NextResponse.json({ error: "No account found with that name." }, { status: 404 });
    }

    if (target.id === user.id) {
      return NextResponse.json({ error: "You can't add yourself." }, { status: 400 });
    }

    // Check for an existing request in either direction.
    const { data: existing } = await supabase
      .from("friend_requests")
      .select("id, status, from_user")
      .or(`and(from_user.eq.${user.id},to_user.eq.${target.id}),and(from_user.eq.${target.id},to_user.eq.${user.id})`)
      .maybeSingle();

    if (existing) {
      if (existing.status === "accepted") {
        return NextResponse.json({ error: "You're already friends." }, { status: 409 });
      }
      if (existing.status === "pending" && existing.from_user === user.id) {
        return NextResponse.json({ error: "You already sent a request to that person." }, { status: 409 });
      }
      if (existing.status === "pending" && existing.from_user === target.id) {
        return NextResponse.json({ error: "That person already sent you a request — check your incoming requests." }, { status: 409 });
      }
      if (existing.status === "rejected") {
        return NextResponse.json({ error: "That user declined a previous request." }, { status: 409 });
      }
    }

    const { error: insertError } = await supabase
      .from("friend_requests")
      .insert({ from_user: user.id, to_user: target.id });

    if (insertError) throw insertError;

    return NextResponse.json({ ok: true, toDisplayName: target.display_name });
  } catch (err) {
    console.error("POST /api/friends failed:", err);
    return NextResponse.json({ error: "Failed to send friend request." }, { status: 500 });
  }
}
