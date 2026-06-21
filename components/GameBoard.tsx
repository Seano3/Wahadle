"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GuessRow from "@/components/GuessRow";
import AuthModal from "@/components/AuthModal";
import StatsModal from "@/components/StatsModal";
import FriendsModal from "@/components/FriendsModal";
import FriendResultsModal from "@/components/FriendResultsModal";
import { FIELDS } from "@/app/lib/judge";
import { useGameBoard, type GuessRow as GuessRowType } from "@/app/lib/useGameBoard";
import { createClient } from "@/app/lib/supabase/client";
import type { UnitSuggestion } from "@/app/lib/units";

type GameBoardProps = {
  title: string;
  guessEndpoint: string;
  extraGuessFields?: Record<string, string>;
  onNewRound?: () => void;
  user?: { displayName: string } | null;
  initialRows?: GuessRowType[];
  initialSolved?: boolean;
  hideAuth?: boolean;
};

export default function GameBoard({
  title,
  guessEndpoint,
  extraGuessFields,
  onNewRound,
  user,
  initialRows,
  initialSolved,
  hideAuth,
}: GameBoardProps) {
  const router = useRouter();
  const { query, setQuery, suggestions, rows, solved, error, guess, reset } =
    useGameBoard({ guessEndpoint, extraGuessFields, initialRows, initialSolved });

  const [showSolvedModal, setShowSolvedModal] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showFriendResults, setShowFriendResults] = useState(false);

  // Only pop the "solved" modal when the user solves it in this visit,
  // not when the board hydrates with an already-solved session.
  const wasInitiallySolved = useRef(initialSolved ?? false);
  useEffect(() => {
    if (solved && !wasInitiallySolved.current) {
      setShowSolvedModal(true);
    }
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
    setShowSolvedModal(false);
    wasInitiallySolved.current = false;
    onNewRound?.();
  }, [reset, onNewRound]);

  const handleSignOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }, [router]);

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
      {/* Auth bar */}
      <div className="flex items-center justify-between text-sm">
        {user ? (
          <>
            <span className="text-neutral-400">{user.displayName}</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowStats(true)}
                className="text-emerald-400 underline"
              >
                Stats
              </button>
              <button
                onClick={() => setShowFriends(true)}
                className="text-emerald-400 underline"
              >
                Friends
              </button>
              <button
                onClick={handleSignOut}
                className="text-neutral-400 underline hover:text-neutral-200"
              >
                Sign out
              </button>
            </div>
          </>
        ) : (
          !hideAuth && (
            <button
              onClick={() => setShowAuth(true)}
              className="text-neutral-500 hover:text-neutral-300 underline"
            >
              Sign in to save your progress
            </button>
          )
        )}
      </div>

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
          disabled={solved}
          placeholder={solved ? "You solved it!" : "Type a unit name..."}
          className="w-full rounded-xl bg-neutral-800 px-4 py-3 outline-none ring-1 ring-neutral-700 focus:ring-emerald-600 disabled:opacity-50"
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
        {solved && (
          <>
            <span className="text-emerald-400">You solved it!</span>
            <button
              onClick={() => setShowSolvedModal(true)}
              className="text-neutral-400 underline hover:text-neutral-200"
            >
              Results
            </button>
          </>
        )}
      </div>

      {showSolvedModal && (
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
              {user && (
                <button
                  onClick={() => { setShowSolvedModal(false); setShowStats(true); }}
                  className="px-4 py-2 bg-neutral-700 text-white rounded hover:bg-neutral-600"
                >
                  View Stats
                </button>
              )}
              {user && (
                <button
                  onClick={() => { setShowSolvedModal(false); setShowFriendResults(true); }}
                  className="px-4 py-2 bg-neutral-700 text-white rounded hover:bg-neutral-600"
                >
                  See Friends&apos; Results
                </button>
              )}
              {onNewRound ? (
                <button
                  onClick={handleNewRound}
                  className="px-4 py-2 bg-neutral-700 text-white rounded hover:bg-neutral-800"
                >
                  Play Again
                </button>
              ) : (
                <button
                  onClick={() => setShowSolvedModal(false)}
                  className="px-4 py-2 bg-neutral-700 text-white rounded hover:bg-neutral-800"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {showStats && <StatsModal onClose={() => setShowStats(false)} />}
      {showFriends && <FriendsModal onClose={() => setShowFriends(false)} />}
      {showFriendResults && <FriendResultsModal onClose={() => setShowFriendResults(false)} />}
    </div>
  );
}
