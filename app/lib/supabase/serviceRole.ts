import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS entirely.
 *
 * Deliberately NOT the same client as app/lib/supabase/server.ts,
 * which uses the anon key + RLS for everything else in the app.
 * This one exists only for the admin data-refresh feature
 * (app/api/admin/import/*), which needs to bulk-delete datasheets
 * that disappeared from a Wahapedia export -- the same operation
 * scripts/import/refresh.ts performs from the CLI using this same
 * key. Both call sites still require checkAdmin() to have passed
 * first; this client itself enforces nothing, by design, so it
 * must never be reachable from a route that skips that check.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY to be set -- this is
 * intentionally a different env var from SUPABASE_ANON_KEY, never
 * exposed with a NEXT_PUBLIC_ prefix, and should not be the same
 * value as the anon key in your .env.local.
 */
export function createServiceRoleClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. The admin data-refresh feature requires the service role key, separate from the anon key the rest of the app uses -- see .env.local.example."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
