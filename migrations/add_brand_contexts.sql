-- Per-brand AI system prompts. One row per brand (CRM pipeline id).
-- ai-handler reads from this table at call time; if no row exists for a
-- given brand, the hardcoded default in src/lib/system-prompt.ts applies.
-- Run in Supabase → SQL Editor.

create table if not exists brand_contexts (
  brand text primary key,
  system_prompt text not null,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users(id) on delete set null
);

alter table brand_contexts disable row level security;
