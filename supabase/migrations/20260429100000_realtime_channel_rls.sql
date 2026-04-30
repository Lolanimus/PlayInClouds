-- Restrict Realtime broadcast channel subscriptions so that authenticated
-- users can only subscribe to their own channels.
--
-- Channel topics follow the pattern:  <prefix>:<user_uuid>
-- Prefixes in use:
--   chats:          – chat list / message updates
--   notifications:  – notification badge / list updates

alter table realtime.messages enable row level security;

drop policy if exists "users can only subscribe to own realtime channels" on realtime.messages;
create policy "users can only subscribe to own realtime channels"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() = 'chats:'         || auth.uid()::text
    or realtime.topic() = 'notifications:' || auth.uid()::text
  );
