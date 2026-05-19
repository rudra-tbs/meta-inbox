-- Audit log for admin-side mutations. Separate from conversation_events
-- (which is per-conversation) — admin events are about users, channels,
-- brand mappings, brand contexts, etc.
--
-- Run in Supabase → SQL Editor. Idempotent.

create table if not exists admin_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id) on delete set null,
  actor_name text,
  actor_email text,
  event_type text not null,           -- e.g. 'USER_INVITED', 'ROLE_CHANGED'
  target_kind text not null,          -- 'user', 'channel', 'brand_pipeline', 'brand_context'
  target_id text,                     -- string so we can carry uuids or brand keys
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_events_created
  on admin_events(created_at desc);

create index if not exists idx_admin_events_target
  on admin_events(target_kind, target_id);

alter table admin_events disable row level security;
