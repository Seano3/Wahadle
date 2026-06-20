-- ============================================================
-- Wahadle: Armageddon launch box placeholders
-- Run this on the same Supabase project, after 01-05.
-- ============================================================
-- 11th edition launched today (June 20, 2026) via the Armageddon
-- launch box (Space Marines vs Orks). Wahapedia hasn't published
-- an 11th-edition export yet (see scripts/import/README.md), but
-- the box's unit list and faction are public knowledge already.
--
-- These are added as NAME-ONLY placeholders -- no Datasheets_models
-- row, no Datasheets_models_cost row. Exact stats (M/T/Sv/W/Ld/OC,
-- points) from the official datasheet cards haven't been confirmed
-- yet against a reliable structured source, and putting guessed
-- numbers into the database would mean the game could show players
-- wrong stats for these units.
--
-- Because the `units` view requires a join to Datasheets_models,
-- a datasheet with no model-line is automatically excluded from
-- the guessable pool -- no extra flag needed. These will simply
-- not appear in-game until stats are filled in via the admin
-- editor (/admin/units), at which point they'll show up
-- automatically on the next page load, same as any other edit.
--
-- IDs use a 99xxxxxxx block deliberately outside Wahapedia's own
-- id space (which is sequential from low numbers) -- checked
-- against the actual restored dataset before picking these, since
-- the first attempt at hand-picking "obviously free" low IDs in
-- the 9000xx range turned out to collide with 13 real existing
-- Adepta Sororitas and Unaligned Forces datasheets. A future
-- Wahapedia refresh assigning a real datasheet into the 99xxxxxxx
-- block is extremely unlikely given their numbering pattern so
-- far, but if it ever happens, `scripts/import/refresh.ts`'s
-- upsert would just overwrite the placeholder with real data,
-- which is the correct outcome anyway.
--
-- To finish one: open it in /admin/units, add a model line with
-- real M/T/Sv/W/Ld/OC from the physical card or the official PDF
-- (linked in `link` below), and a cost line with the points value.
-- ============================================================

insert into public."Source" (id, name, type, edition, version, errata_date, is_legends)
values ('990000000', 'Armageddon Launch Box', 'Box Set', '11', '1.0', '20.06.2026 0:00:00', false)
on conflict (id) do nothing;

-- ----------------------------
-- Space Marines (8 units)
-- ----------------------------
insert into public."Datasheets" (id, name, faction_id, source_id, role, link, removed)
values
  ('990000001', 'Captain with Relic Shield', 'SM', '990000000', 'Characters',
    'https://assets.warhammer-community.com/eng_04-06_warhammer40k_new40k_armageddon_spacemarines_datasheet_cards-hcuj9cke0r-h2rfuky1yw.pdf', false),
  ('990000002', 'Librarian', 'SM', '990000000', 'Characters',
    'https://assets.warhammer-community.com/eng_04-06_warhammer40k_new40k_armageddon_spacemarines_datasheet_cards-hcuj9cke0r-h2rfuky1yw.pdf', false),
  ('990000003', 'Chaplain with Jump Pack', 'SM', '990000000', 'Characters',
    'https://assets.warhammer-community.com/eng_04-06_warhammer40k_new40k_armageddon_spacemarines_datasheet_cards-hcuj9cke0r-h2rfuky1yw.pdf', false),
  ('990000004', 'Ancient', 'SM', '990000000', 'Characters',
    'https://assets.warhammer-community.com/eng_04-06_warhammer40k_new40k_armageddon_spacemarines_datasheet_cards-hcuj9cke0r-h2rfuky1yw.pdf', false),
  ('990000005', 'Intercessor Squad', 'SM', '990000000', 'Battleline',
    'https://assets.warhammer-community.com/eng_04-06_warhammer40k_new40k_armageddon_spacemarines_datasheet_cards-hcuj9cke0r-h2rfuky1yw.pdf', false),
  ('990000006', 'Vanguard Veteran Squad', 'SM', '990000000', 'Other',
    'https://assets.warhammer-community.com/eng_04-06_warhammer40k_new40k_armageddon_spacemarines_datasheet_cards-hcuj9cke0r-h2rfuky1yw.pdf', false),
  ('990000007', 'Eradicator Squad', 'SM', '990000000', 'Other',
    'https://assets.warhammer-community.com/eng_04-06_warhammer40k_new40k_armageddon_spacemarines_datasheet_cards-hcuj9cke0r-h2rfuky1yw.pdf', false),
  ('990000008', 'Land Speeder', 'SM', '990000000', 'Other',
    'https://assets.warhammer-community.com/eng_04-06_warhammer40k_new40k_armageddon_spacemarines_datasheet_cards-hcuj9cke0r-h2rfuky1yw.pdf', false)
on conflict (id) do nothing;

-- ----------------------------
-- Orks (9 units)
-- ----------------------------
insert into public."Datasheets" (id, name, faction_id, source_id, role, link, removed)
values
  ('990000009', 'Warboss', 'ORK', '990000000', 'Characters',
    'https://www.warhammer-community.com/en-gb/articles/rtgp72pg/new40k-rules-ork-datasheets-from-armageddon/', false),
  ('990000010', 'Bigboss', 'ORK', '990000000', 'Characters',
    'https://www.warhammer-community.com/en-gb/articles/rtgp72pg/new40k-rules-ork-datasheets-from-armageddon/', false),
  ('990000011', 'Bannernob', 'ORK', '990000000', 'Characters',
    'https://www.warhammer-community.com/en-gb/articles/rtgp72pg/new40k-rules-ork-datasheets-from-armageddon/', false),
  ('990000012', 'Painboy', 'ORK', '990000000', 'Characters',
    'https://www.warhammer-community.com/en-gb/articles/rtgp72pg/new40k-rules-ork-datasheets-from-armageddon/', false),
  ('990000013', 'Weirdboy', 'ORK', '990000000', 'Characters',
    'https://www.warhammer-community.com/en-gb/articles/rtgp72pg/new40k-rules-ork-datasheets-from-armageddon/', false),
  ('990000014', 'Ork Boyz', 'ORK', '990000000', 'Battleline', null, false),
  ('990000015', 'Gretchin', 'ORK', '990000000', 'Battleline', null, false),
  ('990000016', 'Wartrakk', 'ORK', '990000000', 'Other', null, false),
  ('990000017', 'Big Mek Dakkarig', 'ORK', '990000000', 'Other', null, false)
on conflict (id) do nothing;

-- Sanity check after running:
--
--   select id, name, role from "Datasheets" where source_id = '990000000' order by id;
--   -- expect 17 rows
--
--   select count(*) from units where source_id = '990000000';
--   -- expect 0 -- none of these are guessable yet, by design,
--   -- until model-lines + cost-lines are added via the admin editor

