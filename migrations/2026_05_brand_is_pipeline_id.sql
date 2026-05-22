-- 2026_05_brand_is_pipeline_id.sql
--
-- Collapse the brand_pipelines indirection. The brand identifier
-- across every brand-bearing table becomes the CRM pipeline id
-- directly, so we no longer need a separate mapping table.
--
-- What this migration does, in order:
--   1. Adds brand_settings.initial_stage_id (the only piece of
--      configuration that used to live in brand_pipelines and isn't
--      already represented somewhere else).
--   2. Backfills brand_settings.initial_stage_id from brand_pipelines,
--      keyed by the FINAL brand id we want to land on (47 instead of 2).
--      Done before the rename so backfill keys line up.
--   3. Renames brand='2' to brand='47' across all five brand-bearing
--      Supabase tables in a single transaction. (brand='67' already
--      matches CRM pipeline #67 "The Bride Side" so it stays as-is —
--      its broken brand_pipelines row just disappears with the table.)
--   4. Drops brand_pipelines.
--
-- After this:
--   - conversations.brand, brand_channels.brand, user_access.brand,
--     brand_settings.brand, brand_contexts.brand all contain the CRM
--     pipelines.id as text.
--   - push-to-crm reads brand_settings.initial_stage_id for the
--     initial stage and uses parseInt(brand) for the pipeline id.
--   - No second source of truth for the brand → pipeline mapping.
--
-- Safe to run before OR after the code deploy that consumes the new
-- column. The code is error-tolerant on brand_pipelines.
--
-- Run in Supabase → SQL Editor.

begin;

-- 1. Column.
alter table brand_settings
  add column if not exists initial_stage_id integer;

comment on column brand_settings.initial_stage_id is
  'Initial CRM stage id used by push-to-crm. Was previously stored in '
  'brand_pipelines.initial_stage_id; that table is being retired.';

-- 2. Backfill keyed by the FINAL brand id ('47'), not the current ('2').
--    The brand_pipelines row says brand='2' → pipeline_id=47 → stage 199;
--    we want brand_settings.brand='47'.initial_stage_id = 199 after rename.
--    Anything else in brand_pipelines (like the broken brand='67' →
--    pipeline_id=2) we ignore — pipeline 2 doesn't exist in CRM.
insert into brand_settings (brand, initial_stage_id, updated_at)
select
  case when bp.brand = '2' then '47' else bp.brand end as brand,
  bp.initial_stage_id,
  now()
from brand_pipelines bp
where bp.initial_stage_id is not null
  and not (bp.brand = '67' and bp.pipeline_id = 2)  -- skip the broken row
on conflict (brand) do update
  set initial_stage_id = excluded.initial_stage_id,
      updated_at = now()
  where brand_settings.initial_stage_id is distinct from excluded.initial_stage_id;

-- 3. Rename brand='2' to brand='47' everywhere.
update conversations
  set brand = '47', updated_at = now()
  where brand = '2';

update brand_channels
  set brand = '47', updated_at = now()
  where brand = '2';

update user_access
  set brand = '47'
  where brand = '2';

update brand_settings
  set brand = '47', updated_at = now()
  where brand = '2'
    and not exists (select 1 from brand_settings where brand = '47');

-- If a brand_settings row already existed for '47' (unlikely but
-- possible if someone clicked around), merge by deleting the old '2' row.
delete from brand_settings where brand = '2';

update brand_contexts
  set brand = '47'
  where brand = '2'
    and not exists (select 1 from brand_contexts where brand = '47');

delete from brand_contexts where brand = '2';

-- 4. Drop the now-redundant mapping table.
drop table if exists brand_pipelines;

commit;
