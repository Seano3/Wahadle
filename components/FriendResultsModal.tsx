"use client";

import { useEffect, useState } from "react";
import { FIELDS } from "@/app/lib/judge";
import type { FriendDailyResult } from "@/app/api/friends/daily-results/route";
import type { Feedback } from "@/app/types";

const tileColor = (status: Feedback["status"]) =>
  status === "correct"
    ? "bg-emerald-600"
    : status === "higher" || status === "lower"
    ? "bg-red-600"
    : status === "close-higher" || status === "close-lower" || status === "related"
    ? "bg-amber-400"
    : "bg-neutral-700";

const tileArrow = (status: Feedback["status"]) =>
  status === "higher" || status === "close-higher"
    ? "⬇"
    : status === "lower" || status === "close-lower"
    ? "⬆"
    : status === "correct"
    ? "✔"
    : status === "related"
    ? "〰"
    : "❌";

function GuessGrid({ guesses }: { guesses: FriendDailyResult["guesses"] }) {
  return (
    <div className="space-y-1 mt-2">
      {/* Column headers */}
      <div
        className="grid gap-1 text-[9px] uppercase text-neutral-500"
        style={{ gridTemplateColumns: "minmax(100px,22%) repeat(10, minmax(0,1fr))" }}
      >
        <div />
        {FIELDS.map((f) => (
          <div key={f} className="text-center truncate">{f}</div>
        ))}
      </div>
      {guesses.map((g, i) => (
        <div
          key={i}
          className="grid gap-1 items-center"
          style={{ gridTemplateColumns: "minmax(100px,22%) repeat(10, minmax(0,1fr))" }}
        >
          <div className="truncate text-xs text-neutral-300 pr-1">{g.unitName}</div>
          {g.feedback.map((f) => (
            <div
              key={f.field as string}
              title={f.field}
              className={`text-center py-1 rounded text-xs ${tileColor(f.status)}`}
            >
              <div className="flex flex-col items-center leading-none gap-0.5">
                <span className="text-sm">{tileArrow(f.status)}</span>
                <span className="text-[9px]">{f.data !== null ? f.data : "-"}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function FriendCard({ result }: { result: FriendDailyResult }) {
  const [expanded, setExpanded] = useState(false);

  const statusLabel = !result.played
    ? "Hasn't played yet"
    : result.solved
    ? `Solved in ${result.guessCount} ${result.guessCount === 1 ? "guess" : "guesses"}`
    : `Did not solve (${result.guessCount} ${result.guessCount === 1 ? "guess" : "guesses"})`;

  const statusColor = !result.played
    ? "text-neutral-500"
    : result.solved
    ? "text-emerald-400"
    : "text-red-400";

  return (
    <div className="rounded-xl border border-neutral-800 p-3 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{result.displayName}</div>
          <div className={`text-xs ${statusColor}`}>{statusLabel}</div>
        </div>
        {result.played && result.guesses.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-neutral-400 hover:text-neutral-200 shrink-0"
          >
            {expanded ? "Hide" : "Show guesses"}
          </button>
        )}
      </div>
      {expanded && <GuessGrid guesses={result.guesses} />}
    </div>
  );
}

export default function FriendResultsModal({ onClose }: { onClose: () => void }) {
  const [results, setResults] = useState<FriendDailyResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/friends/daily-results")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setResults(data);
        else setError(data.error ?? "Failed to load.");
      })
      .catch(() => setError("Couldn't reach the server."));
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 p-6 rounded-xl space-y-4 max-w-lg w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Friends&apos; Results</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-100 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto space-y-2 flex-1">
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          {!results && !error && (
            <p className="text-sm text-neutral-400">Loading...</p>
          )}
          {results && results.length === 0 && (
            <p className="text-sm text-neutral-500">
              No friends yet — add some from the Friends menu!
            </p>
          )}
          {results && results.map((r) => (
            <FriendCard key={r.userId} result={r} />
          ))}
        </div>
      </div>
    </div>
  );
}
