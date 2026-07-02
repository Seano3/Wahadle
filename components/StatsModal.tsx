"use client";

import { useEffect, useState } from "react";
import type { UserStats } from "@/app/lib/gameSession";

const DIST_KEYS = ["1", "2", "3", "4", "5", "6", "7+"];

export default function StatsModal({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setStats(data);
      })
      .catch(() => setError("Failed to load stats."));
  }, []);

  const winPct =
    stats && stats.gamesPlayed > 0
      ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
      : 0;

  const maxDist =
    stats
      ? Math.max(1, ...DIST_KEYS.map((k) => stats.guessDistribution[k] ?? 0))
      : 1;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 p-6 rounded-xl space-y-5 max-w-sm w-full">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Stats</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-100 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-300">{error}</p>
        )}

        {!stats && !error && (
          <p className="text-sm text-neutral-400">Loading...</p>
        )}

        {stats && (
          <>
            <h3 className="text-sm font-medium text-neutral-300 mb-2">User Stats</h3>
            <div className="flex justify-center text-center gap-4">
              {[
                { label: "Games Played", value: stats.gamesPlayed },
                { label: "Current Streak", value: stats.currentStreak },
              ].map(({ label, value }) => (
                <div key={label} className="space-y-1">
                  <div className="text-2xl font-bold">{value}</div>
                  <div className="text-xs text-neutral-400">{label}</div>
                </div>
              ))}
            </div>
            <h3 className="text-sm font-medium text-neutral-300 mb-2 mt-4">Today's Puzzle Stats</h3>
            <div className="flex justify-center text-center gap-4">
              {[
                { label: "Total Winners", value: stats.totalWinners },
                { label: "Avg Guesses", value: stats.avgGuesses },
              ].map(({ label, value }) => (
                <div key={label} className="space-y-1">
                  <div className="text-2xl font-bold">{value}</div>
                  <div className="text-xs text-neutral-400">{label}</div>
                </div>
              ))}
            </div>
            <div>
              <h3 className="text-sm font-medium text-neutral-300 mb-2">Guess Distribution</h3>
              <div className="space-y-1">
                {DIST_KEYS.map((k) => {
                  const count = stats.guessDistribution[k] ?? 0;
                  const pct = Math.round((count / maxDist) * 100);
                  return (
                    <div key={k} className="flex items-center gap-2 text-sm">
                      <span className="w-4 text-right text-neutral-400">{k}</span>
                      <div className="flex-1 bg-neutral-800 rounded">
                        <div
                          className="bg-emerald-600 rounded h-5 flex items-center justify-end pr-1.5 text-xs font-medium transition-all"
                          style={{ width: count > 0 ? `max(${pct}%, 1.5rem)` : "0" }}
                        >
                          {count > 0 ? count : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
