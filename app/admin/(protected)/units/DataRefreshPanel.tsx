"use client";

import { useState } from "react";

type Entry = { id: string; name: string | null; faction: string };

type Summary = {
  matched: number;
  models: number;
  costs: number;
  unchangedLegends: number;
  newFactions: { id: string; name: string }[];
  added: Entry[];
  changed: Entry[];
  matchedLoosely: Entry[];
  frozen: Entry[];
  skippedDuplicates: Entry[];
  softDelete: Entry[];
  hardDelete: Entry[];
  keptReferencedLines: number;
};

type Preview = { sha: string; date: string; summary: Summary };

type Phase = "idle" | "checking" | "previewed" | "applying" | "applied" | "error";

/**
 * Admin refresh from 40kdc-data (github.com/wn-mitch/40kdc-data).
 * Unit stats AND points both come from 40kdc, so there's no separate
 * points refresh any more. See scripts/import/kdcCore.ts for how
 * units are matched onto existing ids so past games keep working.
 */
export default function DataRefreshPanel() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const post = async (url: string, body?: object) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
    if (!res.ok) throw new Error(data.error ?? `Server returned ${res.status}`);
    return data;
  };

  const checkForUpdates = async () => {
    setPhase("checking");
    setError(null);
    try {
      setPreview(await post("/api/admin/import/preview"));
      setPhase("previewed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach the server.");
      setPhase("error");
    }
  };

  const applyUpdates = async () => {
    if (!preview) return;
    setPhase("applying");
    setError(null);
    try {
      const data = await post("/api/admin/import/apply", { sha: preview.sha });
      setLogs(data.logs ?? []);
      setPhase("applied");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach the server.");
      setPhase("error");
    }
  };

  const s = preview?.summary;
  const hasChanges =
    s &&
    (s.added.length > 0 ||
      s.changed.length > 0 ||
      s.softDelete.length > 0 ||
      s.hardDelete.length > 0 ||
      s.newFactions.length > 0);

  return (
    <section className="rounded-2xl border border-neutral-800 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-300">40kdc data refresh</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Stats, base sizes and points from{" "}
            <a
              href="https://github.com/wn-mitch/40kdc-data"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-neutral-300"
            >
              40kdc-data
            </a>{" "}
            (CC BY 4.0). Today&apos;s daily answer is never changed mid-day.
          </p>
        </div>
        {(phase === "idle" || phase === "error" || phase === "applied") && (
          <button
            onClick={checkForUpdates}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm shrink-0"
          >
            Check for updates
          </button>
        )}
        {phase === "checking" && (
          <span className="text-sm text-neutral-400 shrink-0">Fetching 40kdc-data and comparing…</span>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {phase === "applied" && (
        <div className="rounded-lg bg-emerald-950 border border-emerald-800 px-4 py-2 text-sm text-emerald-200 space-y-1">
          <div>Update applied. Refresh this page to see the changes in the list below.</div>
          {logs.length > 0 && (
            <ul className="text-xs text-emerald-200/70">
              {logs.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {s && preview && (phase === "previewed" || phase === "applying") && (
        <div className="space-y-4">
          <p className="text-xs text-neutral-500">
            40kdc commit <code>{preview.sha.slice(0, 7)}</code> ({new Date(preview.date).toLocaleString()})
          </p>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <Stat label="Units matched" value={s.matched} />
            <Stat label="Model lines" value={s.models} />
            <Stat label="Points options" value={s.costs} />
          </div>

          {!hasChanges && (
            <p className="text-sm text-neutral-400">
              No differences found &mdash; the database already matches 40kdc-data.
            </p>
          )}

          {s.newFactions.length > 0 && (
            <div className="text-sm text-emerald-400">
              New factions: {s.newFactions.map((f) => f.name).join(", ")}
            </div>
          )}
          <DiffSection title="New units" entries={s.added} tone="emerald" />
          <DiffSection title="Stats, base or points changed" entries={s.changed} tone="amber" />
          <DiffSection title="Matched by a looser name (check these)" entries={s.matchedLoosely} tone="amber" />
          <DiffSection
            title="Today's daily answer (kept as-is until tomorrow)"
            entries={s.frozen}
            tone="neutral"
          />
          <DiffSection
            title="Hidden (no longer in 40kdc, but a past game used it)"
            entries={s.softDelete}
            tone="neutral"
          />
          <DiffSection title="Removed entirely" entries={s.hardDelete} tone="red" />

          {hasChanges && (
            <div className="flex items-center gap-3">
              <button
                onClick={applyUpdates}
                disabled={phase === "applying"}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm disabled:opacity-50"
              >
                {phase === "applying" ? "Applying…" : "Apply these changes"}
              </button>
              <button
                onClick={() => {
                  setPhase("idle");
                  setPreview(null);
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
  entries: Entry[];
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
          <li key={e.id}>
            {e.name ?? `(unnamed: ${e.id})`}
            <span className="ml-2 text-xs text-neutral-500">{e.faction}</span>
          </li>
        ))}
      </ul>
      {remaining > 0 && <div className="text-xs text-neutral-500 mt-1">and {remaining} more…</div>}
    </div>
  );
}
