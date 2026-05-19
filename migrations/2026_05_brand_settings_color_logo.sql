-- Adds optional brand color + logo to brand_settings so the BrandRail can
-- render each brand with its own swatch / icon instead of a generic mono
-- chip. Both columns are nullable — when null, the rail falls back to the
-- short-label rendering it has always used.
--
-- Run in Supabase → SQL Editor. Idempotent.

alter table brand_settings add column if not exists color text;
alter table brand_settings add column if not exists logo_url text;
