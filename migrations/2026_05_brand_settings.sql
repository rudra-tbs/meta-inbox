-- Per-brand runtime settings. One row per brand. Currently holds the default
-- conversation mode (AI/HUMAN) — newly-created conversations on any channel of
-- this brand inherit it. If no row exists for a brand, the system falls back
-- to 'AI' (the historical default). Add future per-brand toggles here rather
-- than spinning up a new table per setting.
--
-- Run in Supabase → SQL Editor. Idempotent.

create table if not exists brand_settings (
  brand text primary key,
  default_mode text check (default_mode in ('AI', 'HUMAN')) not null default 'AI',
  updated_by_user_id uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table brand_settings disable row level security;
