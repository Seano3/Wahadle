import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function getSupabase(): SupabaseClient | null {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
        // warn but don't throw during build-time
        if (process.env.NODE_ENV !== 'test') {
            console.warn('SUPABASE_URL or SUPABASE_ANON_KEY is not set; Supabase client will not be created.');
        }
        return null;
    }
    return createClient(url, key, { auth: { persistSession: false } });
}

export default getSupabase;
