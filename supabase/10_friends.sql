-- Adds display_name to profiles (unique, doubles as the lookup key for
-- friend requests) and creates the friend_requests table.

-- ---------------------------------------------------------------
-- 1. Sync display_name into the profiles table
-- ---------------------------------------------------------------

alter table public.profiles
  add column if not exists display_name text unique;

-- Backfill existing accounts from Auth metadata.
update public.profiles p
set display_name = u.raw_user_meta_data->>'display_name'
from auth.users u
where u.id = p.id
  and p.display_name is null
  and u.raw_user_meta_data->>'display_name' is not null;

-- Update the signup trigger so new accounts populate display_name automatically.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Allow any authenticated user to read profiles (needed for friend name
-- lookup and displaying friend names). The only columns are id, is_admin,
-- created_at, display_name — nothing sensitive enough to restrict reads.
create policy "Authenticated users can read any profile"
  on public.profiles for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------
-- 2. Friend requests table
-- ---------------------------------------------------------------

create table public.friend_requests (
  id          uuid        not null default gen_random_uuid(),
  from_user   uuid        not null references auth.users(id) on delete cascade,
  to_user     uuid        not null references auth.users(id) on delete cascade,
  status      text        not null default 'pending'
                          check (status in ('pending', 'accepted', 'rejected')),
  created_at  timestamptz not null default now(),
  constraint friend_requests_pkey primary key (id),
  constraint friend_requests_pair_key unique (from_user, to_user),
  constraint friend_requests_no_self check (from_user <> to_user)
);

alter table public.friend_requests enable row level security;

-- Users see any request they sent or received.
create policy "Users see own requests"
  on public.friend_requests for select
  using (auth.uid() = from_user or auth.uid() = to_user);

-- Users can only create requests where they are the sender.
create policy "Users create own requests"
  on public.friend_requests for insert
  with check (auth.uid() = from_user);

-- Only the recipient can accept or reject.
create policy "Recipient updates request"
  on public.friend_requests for update
  using (auth.uid() = to_user);

-- Either party can cancel/remove.
create policy "Either party can delete request"
  on public.friend_requests for delete
  using (auth.uid() = from_user or auth.uid() = to_user);
