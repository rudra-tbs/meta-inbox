-- 2026_05_ai_message_feedback.sql
--
-- Thumbs up / down on AI replies. One row per rated message; the
-- rating can be flipped or cleared. Builds the training signal for
-- a future system-prompt refinement / fine-tune — right now we have
-- no observable measure of which AI replies the RMs find useful.
--
-- Why a separate table (rather than a column on messages):
--   - Keeps the messages row light. Most messages are never rated.
--   - Lets us add per-rating metadata (reason, future tags) without
--     widening messages further.
--   - ON DELETE CASCADE keeps cleanup automatic if a conversation is
--     ever hard-deleted; on user delete we keep the row but null the
--     rater so the signal survives.

create table if not exists ai_message_feedback (
  message_id uuid primary key references messages(id) on delete cascade,
  rating text not null check (rating in ('up', 'down')),
  reason text,
  rated_by_user_id uuid references users(id) on delete set null,
  rated_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ai_message_feedback_rating on ai_message_feedback(rating);
create index if not exists idx_ai_message_feedback_rated_at on ai_message_feedback(rated_at desc);

comment on table ai_message_feedback is
  'Per-AI-message thumbs up/down ratings. Used to surface poor replies '
  'for prompt tuning and to track AI quality over time.';
