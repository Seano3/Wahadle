"use client";

import { useState } from "react";

type DiffEntry = { id: string; name: string | null; faction_id: string | null };

type ImportDiff = {
  counts: {
    factions: number;
    sources: number;
    datasheets: number;
    models: number;
    costs: number;
  };
  newDatasheets: DiffEntry[];
  changedDatasheets: DiffEntry[];
  softDeletedDatasheets: DiffEntry[];
  hardDeletedDatasheets: DiffEntry[];
};

type Phase = "idle" | "checking" | "previewed" | "applying" | "applied" | "error";

export default function DataRefreshPanel() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [diff, setDiff] = useState<ImportDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const checkForUpdates = async () => {
    setPhase("checking");
    setError(null);
    setDuplicateWarning(null);
    try {
      const res = await fetch("/api/admin/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to check for updates.");
        setPhase("error");
        return;
      }
      setDiff(data.diff);
      setDuplicateWarning(data.duplicateWarning ?? null);
      setPhase("previewed");
    } catch (e) {
      console.error(e);
      setError("Couldn't reach the server.");
      setPhase("error");
    }
  };

  const applyUpdates = async () => {
    setPhase("applying");
    setError(null);
    try {
      const res = await fetch("/api/admin/import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to apply the update.");
        setPhase("error");
        return;
      }
      setPhase("applied");
    } catch (e) {
      console.error(e);
      setError("Couldn't reach the server.");
      setPhase("error");
    }
  };

  const hasChanges =
    diff &&
    (diff.newDatasheets.length > 0 ||
      diff.changedDatasheets.length > 0 ||
      diff.softDeletedDatasheets.length > 0 ||
      diff.hardDeletedDatasheets.length > 0);

  return (
    <section className="rounded-2xl border border-neutral-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-300">
          Wahapedia data refresh
        </h2>
        {(phase === "idle" || phase === "error") && (
          <button
            onClick={checkForUpdates}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm"
          >
            Check for updates
          </button>
        )}
        {phase === "checking" && (
          <span className="text-sm text-neutral-400">
            Fetching from wahapedia.ru and comparing...
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {phase === "applied" && (
        <div className="rounded-lg bg-emerald-950 border border-emerald-800 px-4 py-2 text-sm text-emerald-200">
          Update applied. Refresh this page to see the new datasheets in the list below.
        </div>
      )}

      {diff && (phase === "previewed" || phase === "applying") && (
        <div className="space-y-4">
          {duplicateWarning && (
            <div className="rounded-lg bg-amber-950 border border-amber-800 px-4 py-2 text-sm text-amber-200">
              <strong>Wahapedia&apos;s export has duplicate rows</strong> (this is a
              data-quality issue on their end, not something this app caused).
              Duplicates are automatically removed before applying, but here&apos;s
              what was found: {duplicateWarning}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 text-sm">
            <Stat label="Datasheets in export" value={diff.counts.datasheets} />
            <Stat label="Model lines" value={diff.counts.models} />
            <Stat label="Cost options" value={diff.counts.costs} />
          </div>

          {!hasChanges && (
            <p className="text-sm text-neutral-400">
              No differences found &mdash; the database already matches the current
              Wahapedia export.
            </p>
          )}

          <DiffSection
            title="New datasheets"
            entries={diff.newDatasheets}
            tone="emerald"
          />
          <DiffSection
            title="Changed (name or faction)"
            entries={diff.changedDatasheets}
            tone="amber"
          />
          <DiffSection
            title="Soft-deleted (referenced by a past daily/round answer, hidden but kept)"
            entries={diff.softDeletedDatasheets}
            tone="neutral"
          />
          <DiffSection
            title="Removed entirely"
            entries={diff.hardDeletedDatasheets}
            tone="red"
          />

          {hasChanges && (
            <div className="flex items-center gap-3">
              <button
                onClick={applyUpdates}
                disabled={phase === "applying"}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm disabled:opacity-50"
              >
                {phase === "applying" ? "Applying..." : "Apply these changes"}
              </button>
              <button
                onClick={() => {
                  setPhase("idle");
                  setDiff(null);
                }}
                disabled={phase === "applying"}
                className="px-4 py-2 bg-neutral-800 text-neutral-300 rounded-xl hover:bg-neutral-700 text-sm disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-neutral-900 p-3">
      <div className="text-lg font-semibold">{value.toLocaleString()}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}

const TONE_CLASSES: Record<string, string> = {
  emerald: "text-emerald-400",
  amber: "text-amber-400",
  red: "text-red-400",
  neutral: "text-neutral-400",
};

function DiffSection({
  title,
  entries,
  tone,
}: {
  title: string;
  entries: DiffEntry[];
  tone: keyof typeof TONE_CLASSES;
}) {
  if (entries.length === 0) return null;

  const preview = entries.slice(0, 10);
  const remaining = entries.length - preview.length;

  return (
    <div>
      <div className={`text-sm font-medium ${TONE_CLASSES[tone]}`}>
        {title} ({entries.length})
      </div>
      <ul className="mt-1 text-sm text-neutral-300 space-y-0.5">
        {preview.map((e) => (
          <li key={e.id}>{e.name ?? `(unnamed: ${e.id})`}</li>
        ))}
      </ul>
      {remaining > 0 && (
        <div className="text-xs text-neutral-500 mt-1">
          and {remaining} more...
        </div>
      )}
    </div>
  );
}
