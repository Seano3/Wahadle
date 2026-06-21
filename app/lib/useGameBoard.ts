"use client";

import { useCallback, useEffect, useState } from "react";
import type { Feedback } from "@/app/types";
import type { UnitSuggestion } from "@/app/lib/units";

export type GuessRow = { label: string; feedback: Feedback[] };

type UseGameBoardOptions = {
  /** POSTs { variantKey, ...extra } and returns { feedback, solved, guess }. */
  guessEndpoint: string;
  /** Extra fields to send with every guess request (e.g. roundId). */
  extraGuessFields?: Record<string, string>;
  /** Pre-populate the board with prior guesses (e.g. from a saved session). */
  initialRows?: GuessRow[];
  /** Whether the puzzle was already solved before this page load. */
  initialSolved?: boolean;
};

export function useGameBoard({
  guessEndpoint,
  extraGuessFields,
  initialRows = [],
  initialSolved = false,
}: UseGameBoardOptions) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<UnitSuggestion[]>([]);
  const [rows, setRows] = useState<GuessRow[]>(initialRows);
  const [solved, setSolved] = useState(initialSolved);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const q = query.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    const run = async () => {
      try {
        const res = await fetch(`/api/units?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (res.ok) setSuggestions(await res.json());
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          console.warn("Failed to fetch suggestions", e);
        }
      }
    };
    run();
    return () => ctrl.abort();
  }, [query]);

  const guess = useCallback(
    async (choice: UnitSuggestion) => {
      if (solved) return;
      setError(null);
      try {
        const res = await fetch(guessEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variantKey: choice.variantKey, ...extraGuessFields }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Something went wrong with that guess.");
          return;
        }
        setRows((rs) => [...rs, { label: data.guess.name, feedback: data.feedback }]);
        if (data.solved) setSolved(true);
        setQuery("");
        setSuggestions([]);
      } catch (e) {
        console.error("Guess failed", e);
        setError("Couldn't reach the server. Try again.");
      }
    },
    [guessEndpoint, extraGuessFields, solved]
  );

  const reset = useCallback(() => {
    setRows([]);
    setSolved(false);
    setQuery("");
    setSuggestions([]);
    setError(null);
  }, []);

  return { query, setQuery, suggestions, rows, solved, error, guess, reset };
}
