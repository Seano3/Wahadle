import { notFound } from "next/navigation";
import { getDatasheetDetail, listFactions, listSources } from "@/app/lib/adminUnits";
import UnitEditForm from "./UnitEditForm";

export default async function AdminUnitEditPage({
  params,
}: {
  params: { id: string };
}) {
  const [detail, factions, sources] = await Promise.all([
    getDatasheetDetail(params.id),
    listFactions(),
    listSources(),
  ]);

  if (!detail) notFound();

  return <UnitEditForm initial={detail} factions={factions} sources={sources} />;
}
