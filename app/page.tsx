import GameBoard from "@/components/GameBoard";

export default function Page() {
  return (
    <main className="space-y-4">
      <div className="flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold">Wahadle</h1>
        <a href="/endless" className="text-sm text-emerald-400 underline">
          Endless mode
        </a>
      </div>
      <p className="text-sm text-neutral-300">
        Guess the daily unit by comparing its stats. ✓ = match, ⬆ = your guess
        is lower than the target, ⬇ = higher, ✗ = mismatch, 〰 means same grand
        order for factions (Imperium, Chaos, Space Marines, and Xenos).
        Datasheets are assumed to be the cheapest option with no upgrades.
      </p>

      <GameBoard title="Wahadle" guessEndpoint="/api/guess/daily" />

      <p className="text-sm text-neutral-300">
        Developed by Sean Thornton. Dataset provided by Wahapedia.ru
      </p>
      <p className="text-sm text-neutral-300">
        Please report bugs or suggest ideas in the Issues section of the{" "}
        <a className="underline" href="https://github.com/Seano3/Wahadle/">
          GitHub
        </a>
        .
      </p>
    </main>
  );
}
