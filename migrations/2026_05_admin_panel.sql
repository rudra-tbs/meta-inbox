-- Admin panel support. Idempotent.

-- 1. Deactivation flag on users. Deactivated users keep their row + history
-- but can't sign in. Defaults to true so existing rows remain active.
alter table users
  add column if not exists active boolean not null default true;

create index if not exists idx_users_active on users(active);
