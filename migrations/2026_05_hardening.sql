-- Production hardening migration. Run in Supabase → SQL Editor.
-- Idempotent; safe to re-run.

-- 1. Atomic unread_count increment. Used by the webhook so concurrent
-- inbound deliveries can't undercount.
create or replace function increment_unread(conv_id uuid)
returns void
language sql
as $$
  update conversations
     set unread_count = coalesce(unread_count, 0) + 1,
         last_message_at = now(),
         updated_at = now()
   where id = conv_id;
$$;

-- 2. delivered_status on messages. Tracks whether the outbound was
-- actually accepted by WhatsApp. Distinct from the existing delivered_at /
-- read_at, which come from Meta status webhooks AFTER delivery.
do $$ begin
  if not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'message_delivery_status'
  ) then
    create type message_delivery_status as enum ('PENDING','SENT','FAILED');
  end if;
end $$;

alter table messages
  add column if not exists delivered_status message_delivery_status default 'SENT';

-- Backfill: anything with a whatsapp_message_id is SENT, anything else is PENDING.
update messages
   set delivered_status = case
         when direction = 'INBOUND' then 'SENT'::message_delivery_status
         when whatsapp_message_id is not null then 'SENT'::message_delivery_status
         else 'PENDING'::message_delivery_status
       end
 where delivered_status is null;

alter table messages
  add column if not exists send_error text;

-- 3. last_message_preview on conversations so /api/conversations doesn't
-- have to pull every message to compute the preview.
alter table conversations
  add column if not exists last_message_preview text;

-- Backfill from latest message per conversation.
update conversations c
   set last_message_preview = m.content
  from (
    select distinct on (conversation_id) conversation_id, content
      from messages
     order by conversation_id, created_at desc
  ) m
 where m.conversation_id = c.id
   and c.last_message_preview is null;

-- 4. Composite index for "latest messages per conversation" lookups.
create index if not exists idx_messages_conv_created
  on messages(conversation_id, created_at desc);

-- 5. Snoozed index for the "hide snoozed" filter on the inbox.
create index if not exists idx_conversations_snoozed_until
  on conversations(snoozed_until)
  where snoozed_until is not null;

-- 6. RLS on conversations + messages. The API uses the service role
-- (createServerClient in src/lib/supabase.ts) which bypasses RLS, so
-- API routes are unaffected. The realtime client subscribes with the
-- anon key, so this blocks unauthenticated subscribers from streaming
-- lead data.
alter table conversations enable row level security;
alter table messages enable row level security;

-- Allow any authenticated user to read for realtime. Granular per-brand
-- filtering still happens in the API layer; this just prevents anonymous
-- replay-of-anon-key attacks.
drop policy if exists "authenticated_read_conversations" on conversations;
create policy "authenticated_read_conversations"
  on conversations for select
  to authenticated
  using (true);

drop policy if exists "authenticated_read_messages" on messages;
create policy "authenticated_read_messages"
  on messages for select
  to authenticated
  using (true);

-- 7. Failed-message retry helper: index for re-driving stuck PENDING/FAILED.
create index if not exists idx_messages_delivery_status
  on messages(delivered_status)
  where delivered_status in ('PENDING','FAILED');
