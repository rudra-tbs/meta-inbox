-- Admin-managed master list of conversation tags. The DetailRail tag input
-- autocompletes from this table, and applied tags are normalized to the
-- canonical name on PATCH so #vip / #VIP / #Vip can't drift apart.
--
-- name PK is the normalized form (lowercased, trimmed). display_name is what
-- agents see in the UI — keep it short. color is optional; when null, the
-- tag chip uses the default styling.
--
-- Run in Supabase → SQL Editor. Idempotent.

create table if not exists tag_taxonomy (
  name text primary key,
  display_name text not null,
  color text,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table tag_taxonomy disable row level security;
