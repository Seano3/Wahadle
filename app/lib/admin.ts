import { createClient } from "@/app/lib/supabase/server";

export type AdminCheckResult =
  | { authorized: true }
  | { authorized: false; reason: "not-signed-in" | "not-admin" };

/**
 * Checks whether the current request's signed-in user (if any) is
 * an admin. This is a defense-in-depth check on top of RLS, not a
 * replacement for it: even if a route forgot to call this, the
 * "Admin write access" policies from supabase/03_search_and_admin.sql
 * would still reject the write at the database level. Calling this
 * first just lets routes return a clean 401/403 instead of letting
 * every write attempt fail at the database and surface a raw
 * Postgres error to the client.
 */
export async function checkAdmin(): Promise<AdminCheckResult> {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { authorized: false, reason: "not-signed-in" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile?.is_admin) {
    return { authorized: false, reason: "not-admin" };
  }

  return { authorized: true };
}
