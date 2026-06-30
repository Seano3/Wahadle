"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CostLine,
  DatasheetDetail,
  FactionOption,
  ModelLine,
  SourceOption,
} from "@/app/lib/adminUnits";

type Props = {
  initial: DatasheetDetail;
  factions: FactionOption[];
  sources: SourceOption[];
};

const emptyModelLine = (line: number): ModelLine => ({
  line,
  name: "",
  M: "",
  T: "",
  Sv: "",
  inv_sv: "",
  inv_sv_descr: "",
  W: "",
  Ld: "",
  OC: "",
  base_size: "",
  base_size_descr: "",
});

const emptyCostLine = (line: number): CostLine => ({
  line,
  description: "",
  cost: null,
});

export default function UnitEditForm({ initial, factions, sources }: Props) {
  const router = useRouter();

  const [name, setName] = useState(initial.name ?? "");
  const [factionId, setFactionId] = useState(initial.factionId ?? "");
  const [sourceId, setSourceId] = useState(initial.sourceId ?? "");
  const [role, setRole] = useState(initial.role ?? "");
  const [legend, setLegend] = useState(initial.legend ?? "");
  const [loadout, setLoadout] = useState(initial.loadout ?? "");
  const [transport, setTransport] = useState(initial.transport ?? "");

  const [modelLines, setModelLines] = useState<ModelLine[]>(initial.modelLines);
  const [costLines, setCostLines] = useState<CostLine[]>(initial.costLines);
  const [deletedModelLines, setDeletedModelLines] = useState<number[]>([]);
  const [deletedCostLines, setDeletedCostLines] = useState<number[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const nextModelLine = () =>
    (modelLines.reduce((max, m) => Math.max(max, m.line), 0) || 0) + 1;
  const nextCostLine = () =>
    (costLines.reduce((max, c) => Math.max(max, c.line), 0) || 0) + 1;

  const updateModelLine = (line: number, patch: Partial<ModelLine>) => {
    setModelLines((rows) =>
      rows.map((r) => (r.line === line ? { ...r, ...patch } : r))
    );
  };

  const updateCostLine = (line: number, patch: Partial<CostLine>) => {
    setCostLines((rows) =>
      rows.map((r) => (r.line === line ? { ...r, ...patch } : r))
    );
  };

  const removeModelLine = (line: number) => {
    setModelLines((rows) => rows.filter((r) => r.line !== line));
    if (initial.modelLines.some((r) => r.line === line)) {
      setDeletedModelLines((d) => [...d, line]);
    }
  };

  const removeCostLine = (line: number) => {
    setCostLines((rows) => rows.filter((r) => r.line !== line));
    if (initial.costLines.some((r) => r.line === line)) {
      setDeletedCostLines((d) => [...d, line]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/units/${initial.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          factionId: factionId || null,
          sourceId: sourceId || null,
          role: role || null,
          legend: legend || null,
          loadout: loadout || null,
          transport: transport || null,
          modelLines,
          costLines,
          deletedModelLines,
          deletedCostLines,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save.");
        return;
      }
      setDeletedModelLines([]);
      setDeletedCostLines([]);
      setSavedAt(Date.now());
      router.refresh();
    } catch (e) {
      console.error(e);
      setError("Couldn't reach the server.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{initial.name ?? "(unnamed)"}</h2>
        <div className="flex items-center gap-3">
          {savedAt && (
            <span className="text-xs text-emerald-400">Saved</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Datasheet fields */}
      <section className="rounded-2xl border border-neutral-800 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-neutral-300">Datasheet</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-emerald-600"
            />
          </Field>
          <Field label="Faction">
            <select
              value={factionId}
              onChange={(e) => setFactionId(e.target.value)}
              className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-emerald-600"
            >
              <option value="">&mdash;</option>
              {factions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Source">
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-emerald-600"
            >
              <option value="">&mdash;</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Role">
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-emerald-600"
            />
          </Field>
          <Field label="Transport">
            <input
              value={transport}
              onChange={(e) => setTransport(e.target.value)}
              className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-emerald-600"
            />
          </Field>
        </div>
        <Field label="Loadout">
          <textarea
            value={loadout}
            onChange={(e) => setLoadout(e.target.value)}
            rows={2}
            className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-emerald-600"
          />
        </Field>
        <Field label="Legend / lore">
          <textarea
            value={legend}
            onChange={(e) => setLegend(e.target.value)}
            rows={3}
            className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-emerald-600"
          />
        </Field>
      </section>

      {/* Model lines */}
      <section className="rounded-2xl border border-neutral-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-300">
            Model lines (stats guessed in-game)
          </h3>
          <button
            onClick={() =>
              setModelLines((rows) => [...rows, emptyModelLine(nextModelLine())])
            }
            className="text-xs text-emerald-400 underline"
            type="button"
          >
            + Add model line
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-400">
                <th className="p-1">Name</th>
                <th className="p-1">M</th>
                <th className="p-1">T</th>
                <th className="p-1">Sv</th>
                <th className="p-1">Inv Sv</th>
                <th className="p-1">W</th>
                <th className="p-1">Ld</th>
                <th className="p-1">OC</th>
                <th className="p-1">Base size</th>
                <th className="p-1" />
              </tr>
            </thead>
            <tbody>
              {modelLines.map((m) => (
                <tr key={m.line} className="border-t border-neutral-800">
                  <Cell value={m.name} onChange={(v) => updateModelLine(m.line, { name: v })} />
                  <Cell value={m.M} onChange={(v) => updateModelLine(m.line, { M: v })} narrow />
                  <Cell value={m.T} onChange={(v) => updateModelLine(m.line, { T: v })} narrow />
                  <Cell value={m.Sv} onChange={(v) => updateModelLine(m.line, { Sv: v })} narrow />
                  <Cell value={m.inv_sv} onChange={(v) => updateModelLine(m.line, { inv_sv: v })} narrow />
                  <Cell value={m.W} onChange={(v) => updateModelLine(m.line, { W: v })} narrow />
                  <Cell value={m.Ld} onChange={(v) => updateModelLine(m.line, { Ld: v })} narrow />
                  <Cell value={m.OC} onChange={(v) => updateModelLine(m.line, { OC: v })} narrow />
                  <Cell
                    value={m.base_size}
                    onChange={(v) => updateModelLine(m.line, { base_size: v })}
                  />
                  <td className="p-1">
                    <button
                      type="button"
                      onClick={() => removeModelLine(m.line)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {modelLines.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-3 text-center text-neutral-500">
                    No model lines. This datasheet won&apos;t be guessable in-game
                    until at least one is added.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cost lines */}
      <section className="rounded-2xl border border-neutral-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-300">
            Squad size / cost options
          </h3>
          <button
            onClick={() => setCostLines((rows) => [...rows, emptyCostLine(nextCostLine())])}
            className="text-xs text-emerald-400 underline"
            type="button"
          >
            + Add cost option
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          The game shows whichever option has the lowest points as the
          unit&apos;s base cost &mdash; see the `units` view in
          01_schema.sql for why.
        </p>
        <div className="space-y-2">
          {costLines.map((c) => (
            <div key={c.line} className="flex items-center gap-2">
              <input
                value={c.description ?? ""}
                onChange={(e) => updateCostLine(c.line, { description: e.target.value })}
                placeholder="e.g. 10 models"
                className="flex-1 rounded-lg bg-neutral-800 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-emerald-600"
              />
              <input
                type="number"
                value={c.cost ?? ""}
                onChange={(e) =>
                  updateCostLine(c.line, {
                    cost: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="pts"
                className="w-24 rounded-lg bg-neutral-800 px-3 py-2 text-sm outline-none ring-1 ring-neutral-700 focus:ring-emerald-600"
              />
              <button
                type="button"
                onClick={() => removeCostLine(c.line)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Remove
              </button>
            </div>
          ))}
          {costLines.length === 0 && (
            <div className="text-sm text-neutral-500">
              No cost options. This datasheet won&apos;t have a points value
              in-game until at least one is added.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-neutral-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Cell({
  value,
  onChange,
  narrow,
}: {
  value: string | null;
  onChange: (v: string) => void;
  narrow?: boolean;
}) {
  return (
    <td className="p-1">
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-lg bg-neutral-800 px-2 py-1 text-sm outline-none ring-1 ring-neutral-700 focus:ring-emerald-600 ${
          narrow ? "w-16" : "w-full"
        }`}
      />
    </td>
  );
}
