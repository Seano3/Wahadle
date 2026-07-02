"use client";

import { useCallback, useEffect, useState } from "react";
import GameBoard from "@/components/GameBoard";

export default function EndlessPage() {
  const [roundId, setRoundId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const startRound = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/endless");
      const data = await res.json();
      setRoundId(data.roundId);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    startRound();
  }, [startRound]);

  return (
    <main className="space-y-4">
      <div className="flex items-center gap-4">
        <a href="/" className="flex items-center gap-4">
          <img src="/icon.png" alt="Wahadle logo" className="w-12 h-12" />
          <h1 className="text-2xl font-semibold">Wahadle &mdash; Endless</h1>
        </a>
        {/* <a href="/" className="text-sm text-emerald-400 underline">
          Daily mode
        </a> */}
      </div>
      <p className="text-sm text-neutral-300">
        Same rules as the daily game, but play as many rounds as you like.
      </p>

      {loading || !roundId ? (
        <div className="text-sm text-neutral-400">Starting a new round...</div>
      ) : (
        <GameBoard
          key={roundId}
          title="Wahadle Endless"
          guessEndpoint="/api/guess/endless"
          extraGuessFields={{ roundId }}
          onNewRound={startRound}
          hideAuth
        />
      )}
    </main>
  );
}
