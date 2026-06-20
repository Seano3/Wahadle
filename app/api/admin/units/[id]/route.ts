import { NextResponse } from "next/server";
import { checkAdmin } from "@/app/lib/admin";
import {
  deleteCostLine,
  deleteModelLine,
  getDatasheetDetail,
  saveDatasheet,
  type DatasheetUpdate,
} from "@/app/lib/adminUnits";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await checkAdmin();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: 403 });
  }

  try {
    const detail = await getDatasheetDetail(params.id);
    if (!detail) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    console.error(`GET /api/admin/units/${params.id} failed:`, err);
    return NextResponse.json({ error: "Failed to load datasheet." }, { status: 500 });
  }
}

type PutBody = DatasheetUpdate & {
  deletedModelLines?: number[];
  deletedCostLines?: number[];
};

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await checkAdmin();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason }, { status: 403 });
  }

  try {
    const body = (await req.json()) as PutBody;

    // Process deletions before upserts, so a line that was removed
    // and a new line that reuses the same line number in the same
    // save don't race against each other.
    for (const line of body.deletedModelLines ?? []) {
      await deleteModelLine(params.id, line);
    }
    for (const line of body.deletedCostLines ?? []) {
      await deleteCostLine(params.id, line);
    }

    await saveDatasheet(params.id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`PUT /api/admin/units/${params.id} failed:`, err);
    return NextResponse.json({ error: "Failed to save datasheet." }, { status: 500 });
  }
}
