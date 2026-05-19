-- Brand-to-CRM-pipeline mapping. One row per brand, stored in Supabase so
-- admins can edit the mapping from /admin → Pipelines instead of needing
-- CRM_PIPELINE_<BRAND>_ID env vars + a redeploy.
--
-- The push-to-CRM route reads this table first, then falls back to the env
-- vars, then to a numeric brand id (post brands_from_pipelines migration).
--
-- Run in Supabase → SQL Editor. Idempotent.

create table if not exists brand_pipelines (
  brand text primary key,
  pipeline_id integer not null,
  initial_stage_id integer not null,
  updated_by_user_id uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table brand_pipelines disable row level security;
