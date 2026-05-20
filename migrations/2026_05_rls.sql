-- Row Level Security — defense in depth on the data tables that the anon-key
-- Supabase client can reach (realtime + direct reads from the browser).
--
-- Server-side code uses the SERVICE_ROLE key via createServerClient, which
-- bypasses RLS entirely, so API routes that already do explicit access checks
-- keep working. The policies below only kick in when an authenticated user's
-- JWT is making the request (i.e. browser Supabase client, including the
-- realtime channel subscriptions in InboxClient).
--
-- We define two helpers up-front so the policies stay readable. Both run
-- with SECURITY DEFINER + STABLE so they're allowed to read users/user_access
-- without triggering policy recursion on those same tables.

create or replace function public.is_admin() returns boolean
  language sql
  security definer
  stable
  set search_path = public
  as $$
    select coalesce(u.role = 'ADMIN', false) and coalesce(u.active, true)
    from public.users u
    where u.auth_id = auth.uid()
    limit 1
  $$;

create or replace function public.user_can_see_brand_channel(b text, ch text) returns boolean
  language sql
  security definer
  stable
  set search_path = public
  as $$
    select exists (
      select 1
      from public.users u
      join public.user_access ua on ua.user_id = u.id
      where u.auth_id = auth.uid()
        and coalesce(u.active, true)
        and ua.brand = b
        and ua.channel = ch
    )
  $$;

-- Enable RLS. Idempotent — Postgres accepts the redundant enable.
alter table conversations enable row level security;
alter table messages enable row level security;
alter table contacts enable row level security;
alter table user_access enable row level security;
alter table users enable row level security;
alter table brand_channels enable row level security;
alter table brand_pipelines enable row level security;
alter table brand_settings enable row level security;
alter table brand_contexts enable row level security;
alter table admin_events enable row level security;
alter table tag_taxonomy enable row level security;
alter table reply_templates enable row level security;

-- Drop any prior policy of the same name so re-running the migration is safe.
drop policy if exists conversations_select on conversations;
drop policy if exists messages_select on messages;
drop policy if exists contacts_select on contacts;
drop policy if exists users_select on users;
drop policy if exists user_access_select on user_access;
drop policy if exists tag_taxonomy_select on tag_taxonomy;

-- Conversations: admins see everything; agents see rows where their
-- user_access includes the (brand, channel) combo.
create policy conversations_select on conversations
  for select using (
    public.is_admin() or public.user_can_see_brand_channel(brand, channel)
  );

-- Messages: visibility follows the parent conversation.
create policy messages_select on messages
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and public.user_can_see_brand_channel(c.brand, c.channel)
    )
  );

-- Contacts: visible if any conversation linking to the contact is visible
-- to the current user. Same join shape as messages.
create policy contacts_select on contacts
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.conversations c
      where c.contact_id = contacts.id
        and public.user_can_see_brand_channel(c.brand, c.channel)
    )
  );

-- Users: see your own row plus all rows if you're an admin. The recursive-
-- looking check goes through is_admin() which is SECURITY DEFINER, so it
-- doesn't re-enter the policy.
create policy users_select on users
  for select using (
    auth_id = auth.uid() or public.is_admin()
  );

-- User access rows: see your own + everything if admin. Avoid joining on
-- public.users from here (that table now has its own RLS); use the same
-- security-definer helper instead.
create policy user_access_select on user_access
  for select using (
    user_id = (select id from public.users where auth_id = auth.uid() limit 1)
    or public.is_admin()
  );

-- Tag taxonomy: any signed-in user can read so the DetailRail autocomplete
-- keeps working. Writes (POST/DELETE /api/admin/tags) go via service role.
create policy tag_taxonomy_select on tag_taxonomy
  for select using (auth.uid() is not null);

-- Reply templates: same as tag taxonomy — readable by any signed-in user;
-- writes via service role.
drop policy if exists reply_templates_select on reply_templates;
create policy reply_templates_select on reply_templates
  for select using (auth.uid() is not null);

-- Brand metadata tables (channels, pipelines, settings, contexts) and
-- admin_events: no SELECT policies. Nothing in the browser reads these
-- with anon key — admin tabs hit dedicated /api/admin/* routes that use
-- the service role. Leaving them locked-down means a future bug that
-- queries these from the browser fails closed.
--
-- Rollback: see migrations/2026_05_rls_rollback.sql.
