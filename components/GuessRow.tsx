"use client";

import { useEffect, useState } from "react";
import { Feedback } from "@/app/types";

const color = (s: Feedback["status"]) =>
  s === "correct" ? "bg-emerald-600"
    : s === "higher" ? "bg-red-600"
      : s === "lower" ? "bg-red-600"
        : s === "close-higher" ? "bg-amber-400"
          : s === "close-lower" ? "bg-amber-400"
            : s === "related" ? "bg-amber-500"
              : "bg-neutral-700";

const arrow = (s: Feedback["status"]) =>
  s === "higher" || s === "close-higher" ? "⬇"
    : s === "lower" || s === "close-lower" ? "⬆"
      : s === "correct" ? "✔"
        : s === "related" ? "〰"
          : "❌";

export default function GuessRow({ label, feedback }: { label: string; feedback: Feedback[] }) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    const total = feedback.length + 1; // include label
    const stepMs = 400;
    let i = 0;

    const tick = () => {
      if (!mounted) return;
      i += 1;
      setVisibleCount(i);
      if (i < total) setTimeout(tick, stepMs);
    };

    // start the reveal after a tiny delay so the user sees the animation
    const start = setTimeout(() => tick(), stepMs);
    return () => { mounted = false; clearTimeout(start); };
  }, [feedback]);

  return (
    <div className="grid gap-1 items-center" style={{ gridTemplateColumns: "minmax(150px,25%) repeat(10, minmax(0,1fr))" }}>
      <div className={`truncate text-sm text-neutral-300 pr-2 transition-all duration-200 ${visibleCount > 0 ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"}`}>
        {label}
      </div>
      {feedback.map((f, idx) => {
        const isVisible = visibleCount > idx + 1; // idx 0 -> visible when visibleCount > 1
        return (
          <div
            key={f.field as string}
            className={`text-xs text-center py-2 rounded ${color(f.status)} transition-all duration-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"}`}
            title={f.field}
          >
            <div className="flex flex-col items-center justify-center">
              <span className="text-lg font-bold">{arrow(f.status)}</span>
              <span className="text-sm">{f.data !== null ? f.data : "-"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}