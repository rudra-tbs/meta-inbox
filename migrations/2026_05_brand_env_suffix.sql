-- 2026_05_brand_env_suffix.sql
--
-- Two related changes:
--
-- 1. Defensively drop any remaining brand CHECK constraints across every
--    brand-bearing table. `brands_from_pipelines.sql` cleared them on
--    `conversations` and `brand_channels`; this catches the rest in case
--    an environment still has them (or a future table inherits one).
--    Brands are free-text identifiers now — CRM pipeline ids in
--    production, but anything works.
--
-- 2. Add `brand_settings.token_env_suffix` so the human-readable env-var
--    key (e.g. WHATSAPP_TOKEN_TBS) is decoupled from the DB brand id
--    (which can be a numeric pipeline id like '67'). Computed at
--    onboarding via brandToEnvKey(display_name); read by
--    src/lib/brand-channels.ts when composing WHATSAPP_TOKEN_<SUFFIX>
--    and INSTAGRAM_TOKEN_<SUFFIX>. Nullable: legacy rows fall back to
--    String(brand).toUpperCase() in code.

do $$
declare c record;
begin
  for c in
    select n.conname as conname, t.relname as tbl
    from pg_constraint n
    join pg_class t on t.oid = n.conrelid
    where n.contype = 'c'
      and t.relname in (
        'conversations',
        'brand_channels',
        'brand_pipelines',
        'brand_settings',
        'brand_contexts',
        'user_access'
      )
      and pg_get_constraintdef(n.oid) ilike '%brand%in%'
  loop
    execute format('alter table %I drop constraint %I', c.tbl, c.conname);
    raise notice 'dropped brand CHECK constraint % on %', c.conname, c.tbl;
  end loop;
end$$;

alter table brand_settings add column if not exists token_env_suffix text;

comment on column brand_settings.token_env_suffix is
  'Suffix used to derive WHATSAPP_TOKEN_<SUFFIX> / INSTAGRAM_TOKEN_<SUFFIX>. '
  'Computed from the brand display name at onboarding via brandToEnvKey(). '
  'When null, code falls back to String(brand).toUpperCase() for legacy rows.';
