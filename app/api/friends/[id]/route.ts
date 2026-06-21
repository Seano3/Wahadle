import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";

// PATCH /api/friends/[id]
// Body: { action: "accept" | "reject" }
// Only the recipient of the request can accept or reject.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const { id } = await params;
    const { action } = await req.json();
    if (action !== "accept" && action !== "reject") {
      return NextResponse.json({ error: "action must be 'accept' or 'reject'." }, { status: 400 });
    }

    const { error } = await supabase
      .from("friend_requests")
      .update({ status: action === "accept" ? "accepted" : "rejected" })
      .eq("id", id)
      .eq("to_user", user.id)   // RLS also enforces this, but be explicit
      .eq("status", "pending");  // can't accept/reject a resolved request

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/friends/[id] failed:", err);
    return NextResponse.json({ error: "Failed to update request." }, { status: 500 });
  }
}

// DELETE /api/friends/[id]
// Either party can cancel an outgoing request, reject an incoming one, or
// remove an accepted friendship.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const { id } = await params;

    const { error } = await supabase
      .from("friend_requests")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/friends/[id] failed:", err);
    return NextResponse.json({ error: "Failed to remove." }, { status: 500 });
  }
}
