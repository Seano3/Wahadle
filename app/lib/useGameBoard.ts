"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  // Track guessed/in-flight variantKeys to block duplicates (ref so it doesn't trigger re-renders).
  const guessedKeys = useRef<Set<string>>(new Set());
  // Derive already-guessed labels from rows (covers initialRows loaded from session).
  const guessedLabels = useRef<Set<string>>(
    new Set(initialRows.map((r) => r.label.toLowerCase()))
  );
  // Keys currently in-flight (submitted but not yet resolved) to catch rapid duplicate submissions.
  const pendingKeys = useRef<Set<string>>(new Set());

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
        if (res.ok) {
          const all: UnitSuggestion[] = await res.json();
          setSuggestions(
            all.filter(
              (s) =>
                !guessedKeys.current.has(s.variantKey) &&
                !guessedLabels.current.has(s.name.toLowerCase())
            )
          );
        }
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
      if (
        guessedKeys.current.has(choice.variantKey) ||
        guessedLabels.current.has(choice.name.toLowerCase()) ||
        pendingKeys.current.has(choice.variantKey)
      ) {
        setError("You've already guessed that unit.");
        return;
      }
      setError(null);
      pendingKeys.current.add(choice.variantKey);
      try {
        const res = await fetch(guessEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variantKey: choice.variantKey, ...extraGuessFields }),
        });
        const data = await res.json();
        if (!res.ok) {
          pendingKeys.current.delete(choice.variantKey);
          setError(data.error ?? "Something went wrong with that guess.");
          return;
        }
        pendingKeys.current.delete(choice.variantKey);
        guessedKeys.current.add(choice.variantKey);
        guessedLabels.current.add(data.guess.name.toLowerCase());
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
    guessedKeys.current.clear();
    guessedLabels.current.clear();
    pendingKeys.current.clear();
  }, []);

  return { query, setQuery, suggestions, rows, solved, error, guess, reset };
}
