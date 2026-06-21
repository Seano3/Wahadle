import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";
import { getUserStats } from "@/app/lib/gameSession";
import { todayEst } from "@/app/lib/daily";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const stats = await getUserStats(user.id, todayEst());
    return NextResponse.json(stats);
  } catch (err) {
    console.error("GET /api/stats failed:", err);
    return NextResponse.json({ error: "Failed to load stats." }, { status: 500 });
  }
}
