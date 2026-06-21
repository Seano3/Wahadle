"use client";

import { useCallback, useMemo, useState } from "react";
import GuessRow from "@/components/GuessRow";
import { FIELDS } from "@/app/lib/judge";
import { useGameBoard } from "@/app/lib/useGameBoard";
import type { UnitSuggestion } from "@/app/lib/units";

type GameBoardProps = {
  title: string;
  guessEndpoint: string;
  extraGuessFields?: Record<string, string>;
  /** Called after a round is solved and the player starts a new one (endless mode only). */
  onNewRound?: () => void;
};

export default function GameBoard({
  title,
  guessEndpoint,
  extraGuessFields,
  onNewRound,
}: GameBoardProps) {
  const { query, setQuery, suggestions, rows, solved, error, guess, reset } =
    useGameBoard({ guessEndpoint, extraGuessFields });
  const [showModal, setShowModal] = useState(false);

  // Re-open the "solved" modal whenever a fresh solve happens.
  useMemo(() => {
    if (solved) setShowModal(true);
  }, [solved]);

  const shareResults = useCallback(() => {
    const tileFor = (status: string) =>
      status === "correct"
        ? "🟩"
        : status === "related" ||
          status === "close-higher" ||
          status === "close-lower"
        ? "🟧"
        : "🟥";

    const result =
      `${title} - ${rows.length} guesses\n` +
      `https://wahadle.seanpthornton.com/\n\n` +
      rows.map((r) => r.feedback.map((f) => tileFor(f.status)).join("")).join("\n");

    navigator.clipboard.writeText(result).then(() => alert("Results copied to clipboard!"));
  }, [rows, title]);

  const handleNewRound = useCallback(() => {
    reset();
    setShowModal(false);
    onNewRound?.();
  }, [reset, onNewRound]);

  const header = useMemo(
    () => (
      <div
        className="grid gap-1 text-[10px] uppercase text-neutral-400 mb-2"
        style={{ gridTemplateColumns: "minmax(150px,25%) repeat(10, minmax(0,1fr))" }}
      >
        <div className="truncate py-2">Unit</div>
        {FIELDS.map((c) => (
          <div key={c} className="text-center py-2">
            {c}
          </div>
        ))}
      </div>
    ),
    []
  );

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && suggestions[0]) guess(suggestions[0]);
          }}
          placeholder="Type a unit name..."
          className="w-full rounded-xl bg-neutral-800 px-4 py-3 outline-none ring-1 ring-neutral-700 focus:ring-emerald-600"
        />
        {suggestions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-xl bg-neutral-900 ring-1 ring-neutral-700 max-h-64 overflow-auto">
            {suggestions.map((s: UnitSuggestion) => (
              <button
                key={s.variantKey}
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  guess(s);
                }}
                className="w-full text-left px-4 py-2 hover:bg-neutral-800"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">{s.name}</div>
                    <div className="text-xs text-neutral-400">
                      {s.faction}
                      {s.modelName && s.modelName.toLowerCase() !== s.name.toLowerCase() && (
                        <span className="text-neutral-500"> · {s.modelName}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-neutral-300 ml-4">
                    {s.modelCountLabel || "-"}
                  </div>
                </div>
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
          {rows.length === 0 && (
            <div className="text-sm text-neutral-400">No guesses yet.</div>
          )}
        </div>
      </div>

      <div className="text-sm text-neutral-300 flex items-center gap-2">
        <span>Guesses:</span>
        <span className="font-semibold">{rows.length}</span>
        {solved && <span className="text-emerald-400">You solved it!</span>}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 p-6 rounded-xl text-center space-y-4 max-w-sm w-full">
            <h2 className="text-xl font-semibold text-emerald-400">Congratulations!</h2>
            <p className="text-sm text-neutral-300">
              You guessed the correct unit in {rows.length} guesses!
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={shareResults}
                className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
              >
                Share Results
              </button>
              {onNewRound ? (
                <button
                  onClick={handleNewRound}
                  className="px-4 py-2 bg-neutral-700 text-white rounded hover:bg-neutral-800"
                >
                  Play Again
                </button>
              ) : (
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-neutral-700 text-white rounded hover:bg-neutral-800"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
