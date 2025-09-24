"use client";

import { useEffect, useMemo, useState } from "react";
import GuessRow from "@/components/GuessRow";
import type { Feedback, StatKey } from "./types";

const COLS: StatKey[] = [
  "Movement", "Toughness", "Save", "Invunl Save", "Wounds", "Leadership", "OC", "Points", "Model Count", "Faction"
];

type Hit = { id: string; name: string; faction: string };

export default function Page() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Hit[]>([]);
  const [rows, setRows] = useState<{ label: string; feedback: Feedback[] }[]>([]);
  const [solved, setSolved] = useState(false);
  const maxGuesses = 6;

  useEffect(() => {
    const ctrl = new AbortController();
    const run = async () => {
      const q = query.trim();
      if (!q) { setSuggestions([]); return; }
      const res = await fetch(`/api/units?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
      if (res.ok) setSuggestions(await res.json());
    };
    run();
    return () => ctrl.abort();
  }, [query]);

  const guess = async (name: string) => {
    if (solved || rows.length >= maxGuesses) return;
    const res = await fetch("/api/guess", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (!res.ok) return;
    const data = await res.json();
    setRows(rs => [...rs, { label: data.guess.name, feedback: data.feedback }]);
    if (data.solved) setSolved(true);
    setQuery("");
    setSuggestions([]);
  };

  const header = useMemo(() => (
    <div className="grid grid-cols-12 gap-1 text-[10px] uppercase text-neutral-400 mb-2">
      <div className="col-span-2">Unit</div>
      {COLS.map(c => <div key={c} className="text-center">{c}</div>)}
    </div>
  ), []);

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">40K Profile Wordle</h1>
      <p className="text-sm text-neutral-300">Guess the daily unit by comparing its stats. ✓ = match, ⬆ = your guess is higher than the target, ⬇ = lower, ✗ = mismatch.</p>

      <div className="relative">
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && suggestions[0]) guess(suggestions[0].name); }} placeholder="Type a unit name..." className="w-full rounded-xl bg-neutral-800 px-4 py-3 outline-none ring-1 ring-neutral-700 focus:ring-emerald-600" />
        {suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-xl bg-neutral-900 ring-1 ring-neutral-700 max-h-64 overflow-auto">
            {suggestions.map((s) => (
              <button key={s.id} onClick={() => guess(s.name)} className="w-full text-left px-4 py-2 hover:bg-neutral-800">
                <div className="text-sm">{s.name}</div>
                <div className="text-xs text-neutral-400">{s.faction}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-neutral-800 p-3">
        {header}
        <div className="space-y-1">
          {rows.map((r, i) => (
            <GuessRow key={i} label={r.label} feedback={r.feedback} />
          ))}
          {rows.length === 0 && <div className="text-sm text-neutral-400">No guesses yet.</div>}
        </div>
      </div>

      <div className="text-sm text-neutral-300 flex items-center gap-2">
        <span>Guesses:</span>
        <span className="font-semibold">{rows.length} / {maxGuesses}</span>
        {solved && <span className="text-emerald-400">You solved it!</span>}
      </div>
    </main>
  );
}