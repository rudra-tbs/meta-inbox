-- Disables RLS on every table the 2026_05_rls migration touched. Use when
-- you need to debug a "row not visible to user" issue without dropping
-- individual policies. Run in Supabase → SQL Editor.

alter table conversations  disable row level security;
alter table messages       disable row level security;
alter table contacts       disable row level security;
alter table user_access    disable row level security;
alter table users          disable row level security;
alter table brand_channels disable row level security;
alter table brand_pipelines disable row level security;
alter table brand_settings disable row level security;
alter table brand_contexts disable row level security;
alter table admin_events   disable row level security;
alter table tag_taxonomy   disable row level security;
alter table reply_templates disable row level security;
