-- Reply templates. Admin-curated, brand-scoped snippets the RM can insert
-- into the composer (autocompleted by `shortcut` after typing `/`).
--
-- This migration file backfills the schema that the application code in
-- src/app/api/reply-templates has been referencing without a corresponding
-- create. Existing deployments that already created the table manually are
-- unaffected by `if not exists`.
--
-- The RLS policy in 2026_05_rls.sql expects this table to exist with the
-- columns below; running that migration before this one will error.
--
-- Run in Supabase → SQL Editor. Idempotent.

create table if not exists reply_templates (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  name text not null,
  content text not null,
  shortcut text,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The GET route filters by brand; shortcut lookups happen brand-scoped from
-- the composer autocomplete. Both are bounded by brand first.
create index if not exists idx_reply_templates_brand
  on reply_templates(brand);

create index if not exists idx_reply_templates_brand_shortcut
  on reply_templates(brand, shortcut)
  where shortcut is not null;

comment on table reply_templates is
  'Admin-curated reply snippets, brand-scoped. The inbox composer '
  'autocompletes by shortcut after the agent types `/`.';
