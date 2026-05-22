-- 2026_05_saved_filters.sql
--
-- Per-user named filter presets. The inbox shows these as chips in the
-- sidebar; clicking one restores the saved (statusFilter, tagFilter,
-- stageFilter) tuple. Stored on the user row as a JSON array of objects
-- like:
--
--   [
--     {"id":"…","name":"My pending","status":"PENDING","tag":null,"stage":null},
--     …
--   ]
--
-- Capped client-side at ~10 entries; the column type allows more if
-- needed. No team-sharing in this iteration — every user has their own
-- list. If shared filters become a need, migrate to a separate
-- user_filters table with a permissions column.

alter table users
  add column if not exists saved_filters jsonb not null default '[]'::jsonb;

comment on column users.saved_filters is
  'Named filter presets for the inbox sidebar. JSON array of '
  '{id, name, status, tag, stage} objects. Managed via /api/me/saved-filters.';
