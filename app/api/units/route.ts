import { NextResponse } from "next/server";
import { searchUnits } from "@/app/lib/units";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";

  try {
    const results = await searchUnits(q);
    return NextResponse.json(results);
  } catch (err) {
    console.error("GET /api/units failed:", err);
    return NextResponse.json(
      { error: "Failed to search units." },
      { status: 500 }
    );
  }
}
