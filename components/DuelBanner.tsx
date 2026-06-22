"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/supabase/client";

type DuelEntry = {
  id: string;
  status: "pending" | "active";
  opponentName: string;
  amChallenger: boolean;
  expiresAt: string;
};

export default function DuelBanner() {
  const router = useRouter();
  const [duels, setDuels] = useState<DuelEntry[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [accepting, setAccepting] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/duel");
      if (!res.ok) return; // 401 = not signed in, silently skip
      const data: DuelEntry[] = await res.json();
      setDuels(data);
    } catch {
      // Network error — ignore
    }
  }, []);

  // Initial load + Supabase Realtime subscription for instant updates.
  // Falls back to a 60-second poll in case the WebSocket disconnects.
  useEffect(() => {
    load();

    const supabase = createClient();
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;

      channel = supabase
        .channel("duel-banner")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "duels" },
          () => { load(); }
        )
        .subscribe();
    });

    const fallback = setInterval(load, 60_000);

    return () => {
      cancelled = true;
      clearInterval(fallback);
      if (channel) supabase.removeChannel(channel);
    };
  }, [load]);

  const accept = async (duelId: string) => {
    setAccepting(duelId);
    try {
      const res = await fetch(`/api/duel/${duelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      if (res.ok) {
        router.push(`/duel/${duelId}`);
      }
    } finally {
      setAccepting(null);
    }
  };

  const decline = async (duelId: string) => {
    setDeclining(duelId);
    try {
      await fetch(`/api/duel/${duelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decline" }),
      });
      setDuels((prev) => prev.filter((d) => d.id !== duelId));
    } finally {
      setDeclining(null);
    }
  };

  const dismiss = (duelId: string) => {
    setDismissed((prev) => new Set(prev).add(duelId));
  };

  const incoming = duels.filter(
    (d) => d.status === "pending" && !d.amChallenger && !dismissed.has(d.id)
  );
  const activeForMe = duels.filter(
    (d) => d.status === "active" && d.amChallenger && !dismissed.has(d.id)
  );

  if (incoming.length === 0 && activeForMe.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {incoming.map((d) => (
        <div
          key={d.id}
          className="flex items-center justify-between gap-3 rounded-xl bg-amber-950 border border-amber-700 px-4 py-3 text-sm"
        >
          <span className="text-amber-200">
            <strong>{d.opponentName}</strong> challenged you to a duel!
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => accept(d.id)}
              disabled={accepting === d.id}
              className="px-3 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-xs font-semibold"
            >
              {accepting === d.id ? "Accepting..." : "Accept"}
            </button>
            <button
              onClick={() => decline(d.id)}
              disabled={declining === d.id}
              className="px-3 py-1 bg-neutral-700 text-neutral-300 rounded-lg hover:bg-neutral-600 disabled:opacity-50 text-xs"
            >
              {declining === d.id ? "..." : "Decline"}
            </button>
            <button
              onClick={() => dismiss(d.id)}
              className="text-neutral-500 hover:text-neutral-300 text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      ))}

      {activeForMe.map((d) => (
        <div
          key={d.id}
          className="flex items-center justify-between gap-3 rounded-xl bg-emerald-950 border border-emerald-700 px-4 py-3 text-sm"
        >
          <span className="text-emerald-200">
            <strong>{d.opponentName}</strong> accepted your duel challenge!
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => router.push(`/duel/${d.id}`)}
              className="px-3 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-semibold"
            >
              Play now
            </button>
            <button
              onClick={() => dismiss(d.id)}
              className="text-neutral-500 hover:text-neutral-300 text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
