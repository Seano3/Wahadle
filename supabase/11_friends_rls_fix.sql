-- Tighten the friend_requests UPDATE policy.
--
-- The original policy had no WITH CHECK clause, meaning the USING
-- predicate only controlled which rows could be touched, not what the
-- row was allowed to look like after the write.  A user hitting
-- PostgREST directly with the public anon key could have changed
-- from_user / to_user to arbitrary UUIDs on any request they received.
--
-- WITH CHECK now restricts the post-update row so:
--   • to_user must still be the current user (can't reassign the request)
--   • status must land on an accepted terminal value (can't set it back
--     to 'pending' or to anything outside the enum)

drop policy if exists "Recipient updates request" on public.friend_requests;

create policy "Recipient updates request"
  on public.friend_requests for update
  using (auth.uid() = to_user)
  with check (
    auth.uid() = to_user
    and status in ('accepted', 'rejected')
  );
