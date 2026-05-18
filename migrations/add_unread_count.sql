-- Adds unread message tracking to conversations.
-- Run in Supabase → SQL Editor.

alter table conversations
  add column if not exists unread_count integer not null default 0;

create index if not exists idx_conversations_unread_count
  on conversations(unread_count)
  where unread_count > 0;
