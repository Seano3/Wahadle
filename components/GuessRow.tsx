import { Feedback } from "@/app/types";

const color = (s: Feedback["status"]) =>
  s === "correct" ? "bg-emerald-600"
    : s === "higher" ? "bg-red-600"
      : s === "lower" ? "bg-red-600"
        : s === "related" ? "bg-amber-500" // orange for related/higher-order match
          : "bg-neutral-700";

export default function GuessRow({ label, feedback }: { label: string; feedback: Feedback[] }) {
  return (
    <div className="grid grid-cols-12 gap-1 items-center">
      <div className="col-span-2 truncate text-sm text-neutral-300 pr-2">{label}</div>
      {feedback.map((f) => (
        <div key={f.field as string} className={`text-xs text-center py-2 rounded ${color(f.status)}`} title={f.field}>
          {f.status === "correct" ? "✓" : f.status === "higher" ? "⬇" : f.status === "lower" ? "⬆" : f.status === "related" ? "≈" : "✗"}
        </div>
      ))}
    </div>
  );
}