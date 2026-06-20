"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/supabase/client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    // A successful sign-in here doesn't guarantee admin access --
    // anyone can create a Supabase Auth account. The /admin layout
    // checks profiles.is_admin server-side on every request and
    // will redirect right back here if this account isn't admin.
    // (See supabase/03_search_and_admin.sql for how to promote an
    // account to admin.)
    router.push("/admin/units");
    router.refresh();
  };

  return (
    <main className="max-w-sm mx-auto mt-16 space-y-6">
      <h1 className="text-xl font-semibold text-center">Wahadle Admin</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}
        <div>
          <label className="block text-sm text-neutral-400 mb-1" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl bg-neutral-800 px-4 py-3 outline-none ring-1 ring-neutral-700 focus:ring-emerald-600"
          />
        </div>
        <div>
          <label className="block text-sm text-neutral-400 mb-1" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl bg-neutral-800 px-4 py-3 outline-none ring-1 ring-neutral-700 focus:ring-emerald-600"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <p className="text-xs text-neutral-500 text-center">
        Accounts are created via Supabase Auth directly. Sign-up isn&apos;t
        exposed here since this is an admin-only area.
      </p>
    </main>
  );
}
