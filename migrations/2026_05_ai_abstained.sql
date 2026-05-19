-- Track when the AI explicitly handed off to a human ("ABSTAIN") so the
-- inbox can show a distinct indicator. Without this flag we can't tell, from
-- the conversation row alone, whether the AI bailed or a human just took
-- over voluntarily — both end up with mode='HUMAN' + manually_set_human=true.
--
-- Cleared on:
--   - human reply (reply route)
--   - explicit mode toggle (mode route)
--
-- Run in Supabase → SQL Editor. Idempotent.

alter table conversations
  add column if not exists ai_abstained boolean not null default false;

create index if not exists idx_conversations_ai_abstained
  on conversations(ai_abstained)
  where ai_abstained = true;
