import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components (e.g. the admin
 * login form). Only the anon key is ever shipped to the browser;
 * every write is still subject to RLS.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
