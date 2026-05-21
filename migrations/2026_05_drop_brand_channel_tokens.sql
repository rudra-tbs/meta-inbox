-- 2026_05_drop_brand_channel_tokens.sql
--
-- Access tokens have moved out of Postgres into Vercel environment
-- variables keyed by brand (WHATSAPP_TOKEN_<BRAND>, INSTAGRAM_TOKEN_<BRAND>).
-- The column is no longer read or written by application code; drop it so
-- a stale token can't leak through a future SELECT *.
--
-- Run AFTER setting all required env vars in production. If you roll back
-- this migration, also revert src/lib/brand-channels.ts to the previous
-- DB-backed read.

alter table brand_channels drop column if exists access_token;
