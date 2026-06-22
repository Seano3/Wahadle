-- Enable Supabase Realtime on the duels table so clients receive
-- instant push notifications on INSERT and UPDATE without polling.
--
-- REPLICA IDENTITY FULL is required so that UPDATE payloads include
-- all column values, not just the changed ones. Supabase uses those
-- values to verify the user's RLS SELECT policy before forwarding
-- the event, so without it the recipient's client would never see
-- status-change events (e.g. "active" after an accept).

alter table public.duels replica identity full;

alter publication supabase_realtime add table public.duels;
