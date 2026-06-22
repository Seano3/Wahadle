import { createClient } from "@/app/lib/supabase/server";
import { getDailySession } from "@/app/lib/gameSession";
import { todayEst } from "@/app/lib/daily";
import GameBoard from "@/components/GameBoard";
import type { GuessRow } from "@/app/lib/useGameBoard";
import { checkAdmin } from "@/app/lib/admin";

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initialRows: GuessRow[] = [];
  let initialSolved = false;
  let admin = false;

  if (user) {
    const session = await getDailySession(user.id, todayEst());
    if (session) {
      initialRows = session.guesses.map((g) => ({
        label: g.unit_name,
        variantKey: g.variantKey,
        feedback: g.feedback,
      }));
      initialSolved = session.solved;
    }
    const result = await checkAdmin();
    admin = result.authorized;

  }

  return (
    <main className="space-y-4">
      <div className="flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold">Wahadle</h1>
        <a href="/endless" className="text-sm text-emerald-400 underline">
          Endless mode
        </a>
        {admin && (
          <a href="/admin" className="text-sm text-neutral-400 underline">
            Admin
          </a>
        )}
      </div>
      <p className="text-sm text-neutral-300">
        Guess the daily unit by comparing its stats. ✓ = match, ⬆ = your guess
        is lower than the target, ⬇ = higher, ✗ = mismatch, 〰 means same grand
        order for factions (Imperium, Chaos, Space Marines, and Xenos).
        Datasheets are assumed to be the cheapest option with no upgrades. Resets daily at 12:00am EST.
      </p>

      <GameBoard
        key={user?.id ?? "anon"}
        title="Wahadle"
        guessEndpoint="/api/guess/daily"
        user={user ? { displayName: user.user_metadata?.display_name ?? user.email ?? "" } : null}
        initialRows={initialRows}
        initialSolved={initialSolved}
      />

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
