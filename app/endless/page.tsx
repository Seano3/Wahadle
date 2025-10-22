"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import GuessRow from "@/components/GuessRow";
import type { Feedback } from "@/app/types";

type Suggestion = {
    id: string;
    name: string;
    faction: string;
    points?: number | null;
    variant_key?: string;
    model_count?: number | null;
};

export default function EndlessPage() {
    const [target, setTarget] = useState<Suggestion | null>(null);
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [rows, setRows] = useState<{ label: string; feedback: Feedback[] }[]>([]);
    const [solved, setSolved] = useState(false);
    const [seed, setSeed] = useState<string | null>(null);

    const loadTarget = useCallback(async (opts?: { seed?: string }) => {
        const url = opts && opts.seed ? `/api/endless?seed=${encodeURIComponent(opts.seed)}` : `/api/endless`;
        const res = await fetch(url);
        if (res.ok) {
            const j = await res.json();
            setTarget(j);
            setRows([]);
            setSolved(false);
        }
    }, []);

    useEffect(() => {
        // ensure a seed is always present in the URL; generate one if missing
        const params = new URLSearchParams(window.location.search);
        let s = params.get("seed");
        if (!s) {
            s = Math.random().toString(36).slice(2, 9);
            const newUrl = `${window.location.pathname}?seed=${encodeURIComponent(s)}`;
            window.history.replaceState({}, '', newUrl);
        }
        setSeed(s);
        loadTarget({ seed: s });
    }, [loadTarget]);

    useEffect(() => {
        const ctrl = new AbortController();
        const run = async () => {
            const q = query.trim();
            if (!q) { setSuggestions([]); return; }
            const res = await fetch(`/api/units?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
            if (res.ok) {
                const json = await res.json();
                // ensure result is an array of suggestions
                setSuggestions(Array.isArray(json) ? json : (json.data ?? []));
            }
        };
        run();
        return () => ctrl.abort();
    }, [query]);

    const guess = async (s: Suggestion) => {
        if (!target || solved) return;
        const payload = {
            targetId: target.id,
            id: s.id,
            name: s.name,
            faction: s.faction,
            points: s.points ?? null,
            variant_key: s.variant_key ?? null,
        };
        const res = await fetch(`/api/endless`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) return;
        const data = await res.json();
        setRows(rs => [...rs, { label: data.guess.name, feedback: data.feedback }]);
        if (data.solved) setSolved(true);
        setQuery("");
        setSuggestions([]);
    };

    const header = useMemo(() => (
        <div className="grid gap-1 text-[10px] uppercase text-neutral-400 mb-2" style={{ gridTemplateColumns: "minmax(150px,25%) repeat(10, minmax(0,1fr))" }}>
            <div className="truncate py-2">Unit</div>
            <div className="text-center py-2">Movement</div>
            <div className="text-center py-2">Toughness</div>
            <div className="text-center py-2">Save</div>
            <div className="text-center py-2">Invunl Save</div>
            <div className="text-center py-2">Wounds</div>
            <div className="text-center py-2">Leadership</div>
            <div className="text-center py-2">OC</div>
            <div className="text-center py-2">Points</div>
            <div className="text-center py-2">Model Count</div>
            <div className="text-center py-2">Faction</div>
        </div>
    ), []);

    return (
        <main className="space-y-4">
            <h1 className="text-2xl font-semibold">Wahadle — Endless Mode</h1>
            <p className="text-sm text-neutral-300">Guess units against a randomly chosen target. When you solve it, click Next Target to keep playing.</p>

            <div className="relative">
                <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && suggestions[0]) guess(suggestions[0]); }} placeholder="Type a unit name..." className="w-full rounded-xl bg-neutral-800 px-4 py-3 outline-none ring-1 ring-neutral-700 focus:ring-emerald-600" />
                {suggestions.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl bg-neutral-900 ring-1 ring-neutral-700 max-h-64 overflow-auto">
                        {suggestions.map((s) => (
                            <button
                                key={`${s.id}::${s.variant_key ?? ""}`}
                                type="button"
                                onPointerDown={(e) => { e.preventDefault(); guess(s); }}
                                onMouseDown={(e) => { e.preventDefault(); }}
                                className="w-full text-left px-4 py-2 hover:bg-neutral-800 flex items-center justify-between"
                            >
                                <div>
                                    <div className="text-sm">{s.name}</div>
                                    <div className="text-xs text-neutral-400">{s.faction}</div>
                                </div>
                                <div className="text-sm text-neutral-300 ml-4">{s.model_count ?? '-'}</div>
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

            <div className="flex gap-2 items-center">
                {target && <div className="text-sm text-neutral-300">Current target id: <span className="font-mono">{target.id}</span></div>}
                {seed && (
                    <div className="text-sm text-neutral-300">
                        <span>Seed: <span className="font-mono">{seed}</span></span>
                        <button onClick={() => { navigator.clipboard.writeText(window.location.href); }} className="ml-2 text-xs text-emerald-400">Copy link</button>
                    </div>
                )}

                {solved && (
                    <button
                        onClick={() => {
                            const token = Math.random().toString(36).slice(2, 9);
                            const newUrl = `${window.location.pathname}?seed=${encodeURIComponent(token)}`;
                            window.history.replaceState({}, '', newUrl);
                            setSeed(token);
                            loadTarget({ seed: token });
                        }}
                        className="ml-2 px-4 py-2 bg-neutral-700 text-white rounded hover:bg-neutral-800"
                    >
                        Next Target
                    </button>
                )}
            </div>
        </main>
    );
}
