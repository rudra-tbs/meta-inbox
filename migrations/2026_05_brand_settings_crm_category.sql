-- Per-brand CRM category mapping. Each brand corresponds to exactly one
-- entry in the CRM's `categories` table (e.g. The Bride Side → Planning
-- and Decor (id 3); Revaah Decor → id 9; Auramist → Makeup (id 2);
-- Rahul Saharan Photography → Photography (id 1)). When set, push-to-CRM
-- writes this value to deals.category_id so inbox-pushed deals match
-- what the CRM populates on every other deal (99.97% of the existing
-- 19,713 deals have a non-null category_id).
--
-- Nullable so the column is backward-compatible: brands that haven't
-- been configured yet continue to push deals without category_id, same
-- as today. Update per brand via SQL until the admin UI is extended:
--
--   update brand_settings set crm_category_id = 3 where brand = '47';   -- TBS
--   update brand_settings set crm_category_id = 9 where brand = '...';  -- Revaah Decor
--
-- Reference category ids (from CRM thebrideside.categories):
--   1 Photography
--   2 Makeup
--   3 Planning and Decor
--   4 Planning
--   5 Decor
--   6 BTS
--   9 Revaah Decor
--
-- Idempotent.

alter table brand_settings
  add column if not exists crm_category_id bigint;

comment on column brand_settings.crm_category_id is
  'CRM categories.id this brand maps to. Pushed to deals.category_id at '
  'push-to-CRM time. Null leaves category_id unset on the deal (legacy '
  'behaviour). See migration header for the current category id list.';
