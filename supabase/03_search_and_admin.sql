-- ============================================================
-- Wahadle: search index + admin auth
-- Run this on the same Supabase project, AFTER 01_schema.sql,
-- 02_daily_targets.sql, and the data restore.
-- ============================================================

-- ----------------------------
-- Trigram index for fast ILIKE '%query%' search on unit names.
-- Without this, every keystroke in the guess autocomplete forces
-- a full sequential scan of Datasheets.
-- ----------------------------
create extension if not exists pg_trgm;

create index if not exists idx_datasheets_name_trgm
  on public."Datasheets" using gin (name gin_trgm_ops);

-- ----------------------------
-- Admin role
--
-- A `profiles` table keyed to auth.users, with a boolean
-- `is_admin` flag. Kept deliberately simple (one flag, not a
-- generic roles system) since this is a single-admin project for
-- now; this is the same table account-management work later will
-- extend with display names, saved scores, etc.
-- ----------------------------
create table if not exists public.profiles (
  id          uuid not null references auth.users(id) on delete cascade,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint profiles_pkey primary key (id)
);

alter table public.profiles enable row level security;

-- A user can read their own profile (needed so the admin page can
-- check `is_admin` for the logged-in user).
create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = id);

-- Automatically create a (non-admin) profile row whenever someone
-- signs up, so every authenticated user has exactly one profile
-- row without the app needing to remember to create it.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------
-- Helper used inside RLS policies below: true only when the
-- currently-authenticated user has is_admin = true.
-- ----------------------------
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
$$ language sql security definer stable set search_path = public;

-- ----------------------------
-- Admin write access to the reference-data tables.
-- Public read policies already exist from 01_schema.sql; these
-- add write access gated by is_admin(), so the admin editor can
-- update/insert/delete through the normal anon-key client using
-- the signed-in admin's session, instead of needing the service
-- role key in application code.
-- ----------------------------
create policy "Admin write access" on public."Datasheets"
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admin write access" on public."Datasheets_models"
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admin write access" on public."Datasheets_models_cost"
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admin write access" on public."Datasheets_keywords"
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admin write access" on public."Factions"
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admin write access" on public."Source"
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- After running this file, promote yourself to admin:
--
-- 1. Sign up for an account through the app's /admin/login page
--    (or via Supabase Auth > Users in the dashboard).
-- 2. Run this, replacing the email with the one you signed up
--    with:
--
--    update public.profiles set is_admin = true
--    where id = (select id from auth.users where email = 'you@example.com');
-- ============================================================
