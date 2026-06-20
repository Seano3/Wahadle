import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use in Server Components, Route Handlers, and
 * Server Actions. Reads/writes the auth session via cookies so that
 * `supabase.auth.getUser()` reflects the signed-in admin user.
 *
 * Uses the anon key + RLS, NOT the service role key — admin writes
 * are authorized by the "Admin write access" RLS policies (see
 * supabase/02_admin_and_auth.sql), keyed off auth.uid(), not by
 * bypassing RLS entirely. This way a bug in route code can't write
 * data a logged-in admin shouldn't be able to write either.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is called from a Server Component in some cases
            // (e.g. during render); Next.js disallows cookie writes
            // there. Middleware refreshes the session instead, so
            // this is safe to ignore.
          }
        },
      },
    }
  );
}
