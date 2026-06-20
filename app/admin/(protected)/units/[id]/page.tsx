import { notFound } from "next/navigation";
import { getDatasheetDetail, listFactions } from "@/app/lib/adminUnits";
import UnitEditForm from "./UnitEditForm";

export default async function AdminUnitEditPage({
  params,
}: {
  params: { id: string };
}) {
  const [detail, factions] = await Promise.all([
    getDatasheetDetail(params.id),
    listFactions(),
  ]);

  if (!detail) notFound();

  return <UnitEditForm initial={detail} factions={factions} />;
}
