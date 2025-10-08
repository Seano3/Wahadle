// // Setup type definitions for built-in Supabase Runtime APIs
// import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Deno.serve(async (req) => {

//     const legendsSources: string[] = ["000000235", "000000245", "000000271", "000000236", "000000100", "000000239", "000000257", "000000260", "000000265", "000000267", "000000237", "000000240", "000000241", "000000243", "000000246", "000000249", "000000250", "000000251", "000000253", "000000254", "000000256", "000000262", "000000264", "000000269", "000000287", "000000276"];

//     try {
//         const supabase = createClient(
//             Deno.env.get('SUPABASE_URL') ?? '',
//             Deno.env.get('SUPABASE_ANON_KEY') ?? '',
//             { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
//         )

//         // Query the SQL view named 'units' (views are selectable just like tables)
//         // PostgREST (used by Supabase) often caps results at 1000 rows per request.
//         // Fetch in pages of 1000 to ensure we collect the full dataset.
//         const pageSize = 1000
//         let allRows: any[] = []
//         let from = 0
//         while (true) {
//             const { data: chunk, error } = await supabase.from('units').select('*').range(from, from + pageSize - 1)
//             if (error) {
//                 throw error
//             }
//             if (!chunk || chunk.length === 0) break
//             allRows = allRows.concat(chunk)
//             if (chunk.length < pageSize) break
//             from += pageSize
//         }

//         // Transform flat rows (one per datasheet-model join) into aggregated units
//         // producing one object per unit with a `models` array and `total_points`.
//         const rows = allRows

//         // Define required fields for completeness check
//         const required = ['unit_id'];
//         // Filter predicate for required fields
//         const isComplete = (r: any) => required.every(k => r[k] !== null && r[k] !== undefined)

//         // Also filter out rows where source_id is one of the legendsSources
//         const filteredRows = rows.filter((r: any) => isComplete(r) && !legendsSources.includes(String(r.source_id ?? '')) && isComplete(r))
//         // Helper to clean movement values (remove trailing double-quote / plus characters and trim)
//         const cleanMovement = (v: any) => {
//             if (v === null || v === undefined) return null
//             if (typeof v === 'string') v = v.replace(/\"/g, '').trim()
//             if (typeof v === 'string') v = v.replace(/\\/g, '').trim()
//             if (typeof v === 'string') return Number(v.replace(/\+/g, '').trim())
//             return v
//         }

//         const cleanSave = (v: any) => {
//             if (v === null || v === undefined) return null
//             if (typeof v === 'string') return Number(v.replace(/\+/g, '').trim())
//             return v
//         }

//         const cleanModelCount = (v: any) => {
//             if (v === null || v === undefined) return null

//             if (typeof v === 'string') {
//                 //split the sentence into words
//                 const words = v.split(' ');
//                 //drop words that are not numbers
//                 const numbers = words.map(w => parseInt(w)).filter(n => !isNaN(n));
//                 //add the numbers together
//                 const total = numbers.reduce((a, b) => a + b, 0);
//                 if (total > 0) return total;
//             }

//             return v
//         }

//         const unitsMap = filteredRows.reduce((acc: Record<string, any>, row: any) => {
//             const id = String(row.unit_id ?? row.id ?? row.unitId ?? '')
//             if (!id) return acc

//             if (!acc[id]) {
//                 acc[id] = {
//                     unit_id: id,
//                     unit_name: row.unit_name ?? row.name ?? null,
//                     faction: row.faction ?? null,
//                     total_points: 0,
//                     models: [] as any[],
//                 }
//             }

//             const model = {
//                 movement: cleanMovement(row.movement ?? row.M ?? null),
//                 toughness: Number(row.toughness ?? row.T ?? null),
//                 save: cleanSave(row.save ?? row.Sv ?? null),
//                 invunl_save: Number(row.invunl_save ?? row.inv_sv ?? null),
//                 wounds: Number(row.wounds ?? row.W ?? null),
//                 leadership: cleanSave(row.leadership ?? row.Ld ?? null),
//                 oc: Number(row.oc ?? row.OC ?? null),
//                 points: Number(row.points) != null ? Number(row.points) : (row.cost != null ? Number(row.cost) : null),
//                 model_count: cleanModelCount(row.Model_Count ?? row.model_count ?? row.description ?? null),
//             }

//             if (typeof model.points === 'number' && !Number.isNaN(model.points)) {
//                 acc[id].total_points += model.points
//             }

//             acc[id].models.push(model)
//             return acc
//         }, {})

//         const transformed = Object.values(unitsMap)

//         return new Response(JSON.stringify({ data: transformed }), {
//             headers: { 'Content-Type': 'application/json' },
//             status: 200,
//         })
//     } catch (err) {
//         const message = (err as any)?.message ?? String(err)
//         return new Response(JSON.stringify({ message }), {
//             headers: { 'Content-Type': 'application/json' },
//             status: 500
//         })
//     }
// })