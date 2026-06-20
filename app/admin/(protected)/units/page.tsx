import Link from "next/link";
import { listDatasheets } from "@/app/lib/adminUnits";

export default async function AdminUnitsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const query = searchParams.q ?? "";
  const datasheets = await listDatasheets(query);

  return (
    <div className="space-y-4">
      <form className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Search datasheets..."
          className="flex-1 rounded-xl bg-neutral-800 px-4 py-2 outline-none ring-1 ring-neutral-700 focus:ring-emerald-600"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700"
        >
          Search
        </button>
      </form>

      <div className="rounded-2xl border border-neutral-800 divide-y divide-neutral-800">
        {datasheets.length === 0 && (
          <div className="p-4 text-sm text-neutral-400">No datasheets found.</div>
        )}
        {datasheets.map((d) => (
          <Link
            key={d.id}
            href={`/admin/units/${d.id}`}
            className="flex items-center justify-between p-4 hover:bg-neutral-900"
          >
            <div>
              <div className="text-sm">{d.name}</div>
              <div className="text-xs text-neutral-400">{d.faction ?? "No faction"}</div>
            </div>
            <div className="text-xs text-neutral-500">
              {d.modelLineCount} model line{d.modelLineCount === 1 ? "" : "s"}
            </div>
          </Link>
        ))}
      </div>

      {datasheets.length === 100 && (
        <p className="text-xs text-neutral-500">
          Showing the first 100 results &mdash; refine your search to narrow further.
        </p>
      )}
    </div>
  );
}
