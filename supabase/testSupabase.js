// scripts/testSupabase.js
// Simple connectivity check for @supabase/supabase-js
// Requires environment variables SUPABASE_URL and SUPABASE_ANON_KEY

const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
    console.error('Please set SUPABASE_URL and SUPABASE_ANON_KEY in the environment.');
    process.exit(2);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

(async () => {
    try {
        const { data, error } = await supabase.rpc('pg_catalog.pg_tables');
        // rpc won't work for that; instead try a simple GET on from a known table or ping
        // We'll try selecting zero rows from information_schema.tables
        const { data: rows, error: qerr } = await supabase
            .from('information_schema.tables')
            .select('table_schema,table_name')
            .limit(1);

        if (qerr) {
            console.error('Query error:', qerr.message || qerr);
            process.exit(1);
        }

        console.log('Supabase connectivity OK. Sample row:', rows[0]);
        process.exit(0);
    } catch (err) {
        console.error('Unexpected error calling Supabase:', err);
        process.exit(1);
    }
})();
