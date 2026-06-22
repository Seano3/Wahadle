"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import GuessRow from "@/components/GuessRow";
import { FIELDS } from "@/app/lib/judge";
import { useGameBoard, type GuessRow as GuessRowType } from "@/app/lib/useGameBoard";
import type { Feedback } from "@/app/types";

// ---------------------------------------------------------------
// Types mirroring API response
// ---------------------------------------------------------------
type CompletedRound = {
  roundNumber: number;
  targetUnitName: string;
  myScore: number;
  mySolved: boolean;
  myGuessCount: number;
  myTimeSeconds: number | null;
  opponentScore: number;
  opponentSolved: boolean;
  opponentGuessCount: number;
  opponentTimeSeconds: number | null;
};

type DuelState = {
  id: string;
  status: "pending" | "active" | "completed" | "declined" | "expired";
  challengerName: string;
  challengedName: string;
  myId: string;
  opponentId: string;
  opponentName: string;
  currentRound: number | null;
  myCurrentRound: {
    guesses: { position: number; unitName: string; feedback: Feedback[] }[];
    completed: boolean;
    solved: boolean;
    score: number | null;
  } | null;
  opponentCurrentRound: {
    guessCount: number;
    feedbackColors: Feedback[][];
    completed: boolean;
  } | null;
  completedRounds: CompletedRound[];
  totalMyScore: number;
  totalOpponentScore: number;
  winner: "me" | "opponent" | "tie" | null;
  winnerId: string | null;
};

// ---------------------------------------------------------------
// Opponent color tiles (no unit names, no stat values)
// ---------------------------------------------------------------
function OpponentTiles({ feedbackColors }: { feedbackColors: Feedback[][] }) {
  const color = (s: Feedback["status"]) =>
    s === "correct"
      ? "bg-emerald-600"
      : s === "close-higher" || s === "close-lower" || s === "related"
        ? "bg-amber-400"
        : s === "mismatch"
          ? "bg-neutral-700"
          : "bg-red-600";

  if (feedbackColors.length === 0) {
    return <p className="text-sm text-neutral-500">No guesses yet.</p>;
  }

  return (
    <div className="space-y-1">
      {feedbackColors.map((row, i) => (
        <div key={i} className="flex gap-1">
          {row.map((f, j) => (
            <div
              key={j}
              className={`w-5 h-5 rounded ${color(f.status)}`}
              title={f.field as string}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------
// Active round game board
// ---------------------------------------------------------------
type ActiveRoundProps = {
  duelId: string;
  roundNumber: number;
  initialRows: GuessRowType[];
  initialSolved: boolean;
  onGiveUp: () => Promise<void>;
  givingUp: boolean;
};

function ActiveRound({
  duelId,
  roundNumber,
  initialRows,
  initialSolved,
  onGiveUp,
  givingUp,
}: ActiveRoundProps) {
  const { query, setQuery, suggestions, rows, solved, error, guess } = useGameBoard({
    guessEndpoint: `/api/duel/${duelId}/guess`,
    extraGuessFields: { roundNumber: String(roundNumber) },
    initialRows,
    initialSolved,
  });

  const header = (
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
  );

  return (
    <div className="space-y-3">
      {!solved && (
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
              {suggestions.map((s) => (
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
      )}

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <div className="overflow-x-auto">
        <div className="rounded-2xl border border-neutral-800 p-3 min-w-[800px]">
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
      </div>

      <div className="flex items-center gap-4 text-sm text-neutral-300">
        <span>Guesses: <strong>{rows.length}</strong></span>
        {solved ? (
          <span className="text-emerald-400 font-semibold">Solved! Waiting for opponent...</span>
        ) : (
          <button
            onClick={onGiveUp}
            disabled={givingUp}
            className="px-3 py-1 bg-neutral-700 text-neutral-300 rounded-lg hover:bg-neutral-600 disabled:opacity-50 text-xs"
          >
            {givingUp ? "Giving up..." : "Give Up"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Main page
// ---------------------------------------------------------------
export default function DuelPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [duelState, setDuelState] = useState<DuelState | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [givingUp, setGivingUp] = useState(false);

  const prevRound = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/duel/${id}`);
      if (!res.ok) {
        const j = await res.json();
        setFetchError(j.error ?? "Failed to load duel.");
        return;
      }
      const data: DuelState = await res.json();
      setDuelState(data);
    } catch {
      setFetchError("Network error. Retrying...");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  // Poll when active and waiting
  useEffect(() => {
    if (!duelState || duelState.status === "completed") return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [duelState?.status, refresh]);

  // Detect round change to reset board (key on ActiveRound handles this)
  useEffect(() => {
    if (duelState?.currentRound != null && prevRound.current !== duelState.currentRound) {
      prevRound.current = duelState.currentRound;
    }
  }, [duelState?.currentRound]);

  const handleGiveUp = useCallback(async () => {
    if (!duelState?.currentRound) return;
    setGivingUp(true);
    try {
      await fetch(`/api/duel/${id}/giveup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundNumber: duelState.currentRound }),
      });
      await refresh();
    } finally {
      setGivingUp(false);
    }
  }, [id, duelState?.currentRound, refresh]);

  if (loading) {
    return (
      <main className="space-y-4">
        <p className="text-neutral-400 text-sm">Loading duel...</p>
      </main>
    );
  }

  if (fetchError || !duelState) {
    return (
      <main className="space-y-4">
        <p className="text-red-400 text-sm">{fetchError ?? "Duel not found."}</p>
        <a href="/" className="text-emerald-400 underline text-sm">← Back to home</a>
      </main>
    );
  }

  const { status, opponentName, currentRound, myCurrentRound, opponentCurrentRound,
    completedRounds, totalMyScore, totalOpponentScore, winner } = duelState;

  // ---- Pending / cancelled states ----
  if (status === "pending") {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">Duel</h1>
        <p className="text-neutral-300">
          Waiting for <strong>{opponentName}</strong> to accept your challenge...
        </p>
        <a href="/" className="text-emerald-400 underline text-sm">← Back to home</a>
      </main>
    );
  }

  if (status === "declined" || status === "expired") {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">Duel</h1>
        <p className="text-neutral-300">
          {status === "declined"
            ? `${opponentName} declined the duel.`
            : "This duel invite expired."}
        </p>
        <a href="/" className="text-emerald-400 underline text-sm">← Back to home</a>
      </main>
    );
  }

  // ---- Completed duel ----
  if (status === "completed") {
    return (
      <main className="space-y-6 max-w-2xl">
        <div className="flex items-baseline gap-4">
          <h1 className="text-2xl font-semibold">Duel — Final Results</h1>
          <a href="/" className="text-sm text-emerald-400 underline">← Home</a>
        </div>

        <div className="rounded-2xl border border-neutral-800 p-5 text-center space-y-1">
          {winner === "me" && (
            <p className="text-2xl font-bold text-emerald-400">You win! 🏆</p>
          )}
          {winner === "opponent" && (
            <p className="text-2xl font-bold text-red-400">{opponentName} wins.</p>
          )}
          {winner === "tie" && (
            <p className="text-2xl font-bold text-amber-400">It&apos;s a tie!</p>
          )}
          <p className="text-neutral-300">
            <span className="font-semibold text-white">{totalMyScore}</span> pts
            {" vs "}
            <span className="font-semibold text-white">{totalOpponentScore}</span> pts ({opponentName})
          </p>
        </div>

        <RoundSummaryTable
          completedRounds={completedRounds}
          opponentName={opponentName}
        />
      </main>
    );
  }

  // ---- Active duel ----
  const myDone = myCurrentRound?.completed ?? false;
  const oppDone = opponentCurrentRound?.completed ?? false;

  const initialRows: GuessRowType[] = (myCurrentRound?.guesses ?? []).map((g) => ({
    label: g.unitName,
    feedback: g.feedback,
  }));

  return (
    <main className="space-y-5">
      {/* Header */}
      <div className="flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold">
          Duel vs {opponentName} — Round {currentRound} of 5
        </h1>
        <a href="/" className="text-sm text-emerald-400 underline">← Home</a>
      </div>

      {/* Score bar */}
      <div className="flex gap-6 text-sm">
        <span>
          <span className="text-neutral-400">You: </span>
          <span className="font-semibold text-white">{totalMyScore} pts</span>
        </span>
        <span>
          <span className="text-neutral-400">{opponentName}: </span>
          <span className="font-semibold text-white">{totalOpponentScore} pts</span>
        </span>
      </div>

      {/* Completed rounds summary (collapsible if long) */}
      {completedRounds.length > 0 && (
        <RoundSummaryTable completedRounds={completedRounds} opponentName={opponentName} />
      )}

      {/* Current round */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* My board */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide">
            Your guesses
          </h2>
          {myDone ? (
            <div className="space-y-2">
              <p className="text-sm text-emerald-400">
                {myCurrentRound?.solved
                  ? `Solved in ${myCurrentRound.guesses.length} guess${myCurrentRound.guesses.length !== 1 ? "es" : ""}! Score: ${myCurrentRound.score ?? 0} pts`
                  : "You gave up this round."}
              </p>
              <div className="overflow-x-auto">
                <div className="rounded-2xl border border-neutral-800 p-3 min-w-[800px]">
                  <div
                    className="grid gap-1 text-[10px] uppercase text-neutral-400 mb-2"
                    style={{ gridTemplateColumns: "minmax(150px,25%) repeat(10, minmax(0,1fr))" }}
                  >
                    <div className="truncate py-2">Unit</div>
                    {FIELDS.map((c) => (
                      <div key={c} className="text-center py-2">{c}</div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    {initialRows.map((r, i) => (
                      <GuessRow key={i} label={r.label} feedback={r.feedback} />
                    ))}
                    {initialRows.length === 0 && (
                      <p className="text-sm text-neutral-400">No guesses made.</p>
                    )}
                  </div>
                </div>
              </div>
              {!oppDone && (
                <p className="text-sm text-neutral-400">
                  Waiting for {opponentName} to finish...
                </p>
              )}
            </div>
          ) : (
            <ActiveRound
              key={currentRound}
              duelId={id}
              roundNumber={currentRound!}
              initialRows={initialRows}
              initialSolved={myCurrentRound?.solved ?? false}
              onGiveUp={handleGiveUp}
              givingUp={givingUp}
            />
          )}
        </div>

        {/* Opponent panel */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide">
            {opponentName}&apos;s progress
          </h2>
          {oppDone ? (
            <p className="text-sm text-emerald-400 font-semibold">Finished this round!</p>
          ) : (
            <p className="text-sm text-neutral-400">
              {opponentCurrentRound?.guessCount ?? 0} guess
              {(opponentCurrentRound?.guessCount ?? 0) !== 1 ? "es" : ""} so far
            </p>
          )}
          <OpponentTiles feedbackColors={opponentCurrentRound?.feedbackColors ?? []} />
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------
// Round summary table (shared by active and completed views)
// ---------------------------------------------------------------
function RoundSummaryTable({
  completedRounds,
  opponentName,
}: {
  completedRounds: CompletedRound[];
  opponentName: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-800 text-neutral-400 text-xs uppercase">
            <th className="px-4 py-2 text-left">Round</th>
            <th className="px-4 py-2 text-left">Unit</th>
            <th className="px-4 py-2 text-right">Your score</th>
            <th className="px-4 py-2 text-right">{opponentName}</th>
          </tr>
        </thead>
        <tbody>
          {completedRounds.map((r) => (
            <tr key={r.roundNumber} className="border-b border-neutral-800/50">
              <td className="px-4 py-2 font-semibold">{r.roundNumber}</td>
              <td className="px-4 py-2 text-neutral-300 text-xs">{r.targetUnitName}</td>
              <td className="px-4 py-2 text-right">
                <span className={r.myScore > 0 ? "text-emerald-400" : "text-neutral-500"}>
                  {r.myScore}
                </span>
                <span className="text-neutral-500 text-xs ml-1">
                  ({r.mySolved ? `${r.myGuessCount}g` : "gave up"}
                  {r.myTimeSeconds != null ? `, ${r.myTimeSeconds}s` : ""})
                </span>
              </td>
              <td className="px-4 py-2 text-right">
                <span className={r.opponentScore > 0 ? "text-emerald-400" : "text-neutral-500"}>
                  {r.opponentScore}
                </span>
                <span className="text-neutral-500 text-xs ml-1">
                  ({r.opponentSolved ? `${r.opponentGuessCount}g` : "gave up"}
                  {r.opponentTimeSeconds != null ? `, ${r.opponentTimeSeconds}s` : ""})
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
