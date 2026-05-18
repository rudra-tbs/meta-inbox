-- Switch brand identifiers from the hardcoded 'TBS' | 'RD' enum to whatever
-- the CRM pipelines.id is (stored as text). Drop the CHECK constraints so
-- new pipeline-id values are accepted. Existing rows ('TBS', 'RD') are NOT
-- migrated by this script — they'll keep working until you choose to remap
-- them to specific pipeline IDs.
--
-- Run in Supabase → SQL Editor.

-- Find and drop the brand CHECK constraints. Their generated names differ
-- per project, so look them up by table and column rather than hardcoding.
do $$
declare
  c record;
begin
  for c in
    select conname, conrelid::regclass as tbl
    from pg_constraint
    where contype = 'c'
      and conrelid in ('conversations'::regclass, 'brand_channels'::regclass)
      and pg_get_constraintdef(oid) ilike '%brand%in%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
    raise notice 'dropped constraint % on %', c.conname, c.tbl;
  end loop;
end$$;

-- Optional manual remap once you know the pipeline IDs to use:
--
--   update conversations set brand = '67' where brand = 'TBS';
--   update conversations set brand = '58' where brand = 'RD';
--   update brand_channels set brand = '67' where brand = 'TBS';
--   update brand_channels set brand = '58' where brand = 'RD';
--   update user_access   set brand = '67' where brand = 'TBS';
--   update user_access   set brand = '58' where brand = 'RD';
