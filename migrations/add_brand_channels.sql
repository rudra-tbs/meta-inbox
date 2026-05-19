-- Brand-scoped channel credentials. One row per (brand, channel). Agents
-- signing up for a brand inherit whichever channels are already configured.
-- Run in Supabase → SQL Editor.
--
-- App-level secrets (WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN) stay as
-- env vars because they're per-Meta-App, not per-brand. Only the access
-- token and the phone_number_id (or IG account id) vary per brand.

create table if not exists brand_channels (
  id uuid primary key default gen_random_uuid(),
  -- brand is a CRM pipeline id (stored as text). No enum here so onboarding a
  -- new brand never requires a schema migration.
  brand text not null,
  channel text check (channel in ('WA', 'IG')) not null,

  -- Provider identifier. WA: Meta phone_number_id. IG: instagram account id.
  external_account_id text not null,

  -- Long-lived access token used to send messages for this brand+channel.
  access_token text not null,

  -- Human label shown in the UI (e.g. "+91 98... WhatsApp", "@handle").
  display_name text,

  configured_by_user_id uuid references users(id) on delete set null,
  configured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(brand, channel),
  unique(external_account_id, channel)
);

create index if not exists idx_brand_channels_external
  on brand_channels(external_account_id, channel);

alter table brand_channels disable row level security;
