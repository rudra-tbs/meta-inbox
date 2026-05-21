# Acceltancy Inbox — Claude Code Build Spec
# Phase 1: TBS WhatsApp · Standalone · No CRM integration

> **Document status:** Sections below this banner are the original Phase-1
> build spec. The codebase has since shipped multi-brand routing, Instagram
> parity, contact dedup, an admin panel, RLS, and TBS CRM (MySQL) push.
> Jump to **"Current State (Post Phase 1)"** at the bottom of this file
> for the up-to-date architecture, then read this spec for the original
> intent. The two together describe what's actually running today.

---

## Project overview

Build a production-ready multi-channel inbox for Acceltancy. Phase 1 covers **The Bride Side (TBS)** on **WhatsApp only**. The architecture must support adding more brands (Revaah Decor, etc.) and channels (Instagram DMs) in Phase 2 with minimal changes.

The system has two parts:
1. A **WhatsApp AI agent** that qualifies inbound leads automatically
2. A **dashboard** where the team manages all conversations, toggles AI/human mode, and replies manually

This is a standalone Next.js app. No CRM integration in Phase 1.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL + Realtime) |
| AI | OpenRouter API |
| WhatsApp | Meta Cloud API |
| Auth | Supabase Auth (email/password) |
| Deployment | Vercel |
| Styling | Tailwind CSS |

---

## Environment variables

Create `.env.example` (committed) and `.env.local` (gitignored):

```
# WhatsApp / Meta
WHATSAPP_ACCESS_TOKEN=        # Permanent system user token from Meta Business
WHATSAPP_PHONE_NUMBER_ID=     # Phone number ID from Meta app API setup
WHATSAPP_VERIFY_TOKEN=        # Any string you choose; used to verify webhook

# OpenRouter
OPENROUTER_API_KEY=           # From openrouter.ai → Settings → API Keys
OPENROUTER_MODEL=             # e.g. meta-llama/llama-3.1-8b-instruct:free

# Supabase
NEXT_PUBLIC_SUPABASE_URL=     # Project URL from Supabase → Connect → API
NEXT_PUBLIC_SUPABASE_ANON_KEY= # Anon key from Supabase → Settings → API
SUPABASE_SERVICE_ROLE_KEY=    # Service role key (server-side only)

# App
NEXT_PUBLIC_APP_URL=          # e.g. https://desk.acceltancy.in or localhost:3000
```

---

## Database schema

Drop existing tables and run this fresh SQL in Supabase → SQL Editor.

```sql
-- Users: dashboard team members (linked to Supabase Auth)
create table users (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique,                          -- links to Supabase Auth uid
  name text not null,
  email text unique not null,
  role text check (role in ('ADMIN', 'AGENT')) default 'AGENT',
  created_at timestamptz default now()
);

-- User brand+channel access (agents only; admins bypass this)
create table user_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  brand text not null,    -- e.g. 'TBS', 'RD'
  channel text not null,  -- e.g. 'WA', 'IG'
  unique(user_id, brand, channel)
);

-- Conversations: one row per unique contact per brand+channel
create table conversations (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  contact_name text,
  brand text check (brand in ('TBS', 'RD')) default 'TBS',
  channel text check (channel in ('WA', 'IG')) default 'WA',
  mode text check (mode in ('AI', 'HUMAN')) default 'AI',
  status text check (status in ('ACTIVE', 'QUALIFIED', 'UNQUALIFIED', 'CLOSED')) default 'ACTIVE',
  assigned_to uuid references users(id) on delete set null,
  is_first_contact boolean default true,
  ai_reactivation_window_days integer default 30,
  -- Qualification fields
  city text,
  wedding_date text,
  guest_count text,
  budget_range text,
  service_type text,
  -- Timestamps
  first_contact_at timestamptz default now(),
  last_message_at timestamptz default now(),
  last_human_message_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(phone_number, brand, channel)
);

-- Messages: every message in both directions
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade not null,
  direction text check (direction in ('INBOUND', 'OUTBOUND')) not null,
  sender text check (sender in ('LEAD', 'AI', 'HUMAN')) not null,
  sender_user_id uuid references users(id) on delete set null,
  content text not null,
  whatsapp_message_id text unique,
  created_at timestamptz default now()
);

-- Indexes
create index idx_messages_conversation_id on messages(conversation_id);
create index idx_messages_created_at on messages(created_at desc);
create index idx_conversations_last_message on conversations(last_message_at desc);
create index idx_conversations_phone on conversations(phone_number);
create index idx_conversations_brand_channel on conversations(brand, channel);
create index idx_conversations_assigned on conversations(assigned_to);

-- Realtime
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;

-- Disable RLS (internal tool; security handled at API layer)
alter table users disable row level security;
alter table user_access disable row level security;
alter table conversations disable row level security;
alter table messages disable row level security;
```

---

## AI mode logic

Implement this exactly in `src/lib/ai-mode.ts`.

### On every inbound message:

```
1. Look up conversation by (phone_number, brand='TBS', channel='WA')

2. If conversation does NOT exist:
   → Create with mode='AI', is_first_contact=true
   → Route to AI

3. If conversation EXISTS:
   a. If last_human_message_at IS NULL:
      → mode = 'AI' (never had human interaction)
   b. If last_human_message_at is within 30 days:
      → mode = 'HUMAN' (keep human mode, don't activate AI)
   c. If last_human_message_at is older than 30 days:
      → mode = 'AI' (reactivate — cold lead returning)
   → Update conversation.mode if it changed

4. Route based on final mode:
   → AI: call ai-handler
   → HUMAN: do nothing, RM replies from dashboard
```

### On AI reply:
- Set `is_first_contact = false`

### On human RM reply:
- Set `last_human_message_at = now()`
- Set `mode = 'HUMAN'`

### On manual toggle from dashboard:
- Respect the toggle — override automatic logic
- The next inbound message will re-evaluate based on `last_human_message_at`

---

## User access control

### Admin
- Sees all brands, all channels, all conversations
- No `user_access` rows needed

### Agent
- Sees only brand+channel combos listed in their `user_access` rows
- Within allowed brand+channel: sees unassigned conversations + conversations assigned to them
- Cannot see conversations assigned to other agents

### Access filter (apply in all conversation API routes)

```typescript
// src/lib/auth.ts
export async function getConversationFilter(userId: string) {
  const user = await getUserById(userId);
  if (user.role === 'ADMIN') return null; // no filter

  const access = await supabase
    .from('user_access')
    .select('brand, channel')
    .eq('user_id', userId);

  return {
    allowedBrandChannels: access.data, // [{brand, channel}]
    userId,
  };
}
```

---

## Auth

Use Supabase Auth with email/password.

### Login flow
1. User submits email + password on `/login`
2. Authenticate via `supabase.auth.signInWithPassword()`
3. On success: look up `users` table by `auth_id = session.user.id`
4. Store session via `@supabase/ssr` cookie helpers
5. Redirect to `/inbox`

### Middleware (`middleware.ts`)
- Protect all routes except `/login` and `/api/webhook`
- Unauthenticated requests → redirect to `/login`
- Use `createServerClient` from `@supabase/ssr` in middleware

### Seed admin user
After creating your Supabase Auth user manually (via Supabase dashboard or signup), insert:

```sql
insert into users (auth_id, name, email, role)
values ('REPLACE-WITH-YOUR-SUPABASE-AUTH-UID', 'Rudra', 'rudra@acceltancy.in', 'ADMIN');
```

---

## API routes

### `POST /api/webhook` — public, no auth

1. Verify `X-Hub-Signature-256` header
2. Parse Meta webhook payload
3. Extract: `from`, `text.body`, message `id`, contact profile name
4. Skip if `whatsapp_message_id` already exists (deduplication)
5. Apply AI mode logic
6. Upsert conversation, insert inbound message
7. Route to AI or skip
8. Return 200 immediately

### `GET /api/webhook` — public, no auth

Webhook verification: check `hub.verify_token`, respond with `hub.challenge`

### `GET /api/conversations` — authenticated

Query params: `brand`, `channel`, `mode`, `status`, `mine` (boolean), `search`
Apply access control filter. Return with last message preview + assigned user name.

### `GET /api/conversations/[id]/messages` — authenticated

Return all messages `order by created_at asc`. Include sender name for human messages.

### `POST /api/conversations/[id]/mode` — authenticated

Body: `{ mode: 'AI' | 'HUMAN' }`
If switching to HUMAN: set `last_human_message_at = now()`

### `POST /api/conversations/[id]/reply` — authenticated

Body: `{ message: string }`
Send via WhatsApp API. Insert message with `sender='HUMAN'`, `sender_user_id`.
Set `last_human_message_at = now()`, `mode = 'HUMAN'`.

### `POST /api/conversations/[id]/assign` — authenticated

Body: `{ userId: string | null }`
Update `assigned_to`. Admins can assign to anyone; agents can only self-assign.

### `GET /api/users` — authenticated, admin only

Return all users with their `user_access` rows.

### `POST /api/users` — authenticated, admin only

Body: `{ name, email, password, role, access: [{brand, channel}] }`
Create Supabase Auth user + `users` row + `user_access` rows.

---

## AI handler

File: `src/lib/ai-handler.ts`

```
async function handleAIResponse(conversation, inboundMessage):
  1. Fetch last 20 messages for this conversation
  2. Build OpenRouter messages array: system prompt + history + new user message
  3. Call OpenRouter API
  4. Split response: text before <qualification_data> tag = what gets sent to lead
  5. Send clean text to WhatsApp
  6. Insert outbound message with sender='AI'
  7. Parse qualification JSON, update non-null fields on conversation
  8. If is_qualified=true: set status='QUALIFIED'
  9. Set is_first_contact=false
```

### OpenRouter call

```typescript
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL,
    'X-Title': 'Acceltancy Inbox',
  },
  body: JSON.stringify({
    model: process.env.OPENROUTER_MODEL,
    messages: builtMessages,
    max_tokens: 300,
    temperature: 0.7,
  }),
});
```

---

## System prompt

File: `src/lib/system-prompt.ts`

```
You are a warm, professional lead qualification assistant for The Bride Side,
a premium on-site wedding planning company based in India (part of Acceltancy).

Your job is to have a natural, friendly conversation to understand what the 
lead needs. Do NOT sound like a bot or use rigid scripts. Be conversational.

The Bride Side handles: end-to-end wedding planning, vendor coordination, 
on-site management, and can also arrange decor through our in-house team.

YOUR GOALS (collect these naturally over the conversation):
1. City / location of the wedding
2. Wedding date (approximate is fine)
3. Guest count (approximate)
4. Budget range
5. Service type: full planning / day-of coordination / planning + decor

RULES:
- Ask max 1-2 questions per message. Never fire a list of questions at once.
- If they mention a city, budget, or date naturally, note it and don't ask again.
- Respond in the same language the lead uses (Hindi or English or Hinglish).
- Keep responses under 100 words unless they ask for detail.
- Once you have all 5 data points, tell them: "Thank you! One of our wedding 
  planners will reach out to you shortly with a customised plan."
- Never make up prices, packages, or availability.
- If asked something you don't know, say "Our planners will be able to give 
  you the exact details — they'll reach out shortly!"
- If the lead is abusive or clearly not interested, politely close the 
  conversation.

At the end of EVERY message, output a JSON block (invisible to lead) like this:
<qualification_data>
{
  "brand": "TBS",
  "city": "string or null",
  "wedding_date": "string or null",
  "guest_count": "string or null",
  "budget_range": "string or null",
  "service_type": "string or null",
  "is_qualified": true/false
}
</qualification_data>

The JSON block will be stripped before sending to the lead.
```

---

## Dashboard UI

### Three-column layout

```
[ Brand rail 52px ] [ Sidebar 260px ] [ Chat panel flex-1 ]
```

### Brand rail (52px, leftmost)
- Vertical stack of brand buttons: TBS (active, white card with border), RD (greyed, coming soon)
- Small label under each: "Bride Side", "Revaah"
- "+" at bottom for future brands (non-functional Phase 1)
- Clicking a brand switches the sidebar context

### Conversation sidebar (260px)
- **Channel tabs**: WhatsApp (active) | Instagram (greyed, Phase 2)
- **Search input**: filter by name or phone
- **Filter pills**: All | AI | Human | Qualified | Mine
- **Conversation list** (scrollable):
  - Row: name + time ago, last message preview, badge (AI green / Human+name amber)
  - Green unread dot for unseen messages
- **Stats bar** (2×2 grid): Today | Qualified | AI handled | Handed off

### Chat panel
- **Header**:
  - Contact name + phone
  - Sub-line: "New lead" OR "Returning · last active X days ago"
  - Right: Assign button (agent dropdown) + AI/Human toggle pill
- **Lead info bar** (single row below header):
  - City | Wedding date | Guests | Budget | Service — `—` until filled
- **Chat area** (scrollable, newest at bottom):
  - Lead messages: left-aligned, white bubble
  - AI replies: right-aligned, green bubble, "AI" label
  - Human replies: right-aligned, purple bubble, agent name label
  - Timestamp per message
- **Input bar**:
  - Disabled + hint "Switch to human mode to reply" in AI mode
  - Active in human mode with Send button

### Login page `/login`
- Email + password fields
- "Sign in" button
- Clean centered card layout

---

## Realtime

```typescript
supabase
  .channel('inbox')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' },
    () => reloadConversations())
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
    (payload) => appendMessageToActiveChat(payload.new))
  .subscribe();
```

---

## Project structure

```
/
├── src/
│   ├── app/
│   │   ├── page.tsx                        # Redirects to /inbox
│   │   ├── login/page.tsx                  # Login page
│   │   ├── inbox/page.tsx                  # Main inbox UI
│   │   ├── layout.tsx
│   │   └── api/
│   │       ├── webhook/route.ts
│   │       ├── conversations/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       ├── route.ts
│   │       │       ├── messages/route.ts
│   │       │       ├── mode/route.ts
│   │       │       ├── reply/route.ts
│   │       │       └── assign/route.ts
│   │       └── users/route.ts
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── auth.ts
│   │   ├── whatsapp.ts
│   │   ├── openrouter.ts
│   │   ├── ai-mode.ts
│   │   ├── ai-handler.ts
│   │   └── system-prompt.ts
│   ├── components/
│   │   ├── BrandRail.tsx
│   │   ├── ChannelTabs.tsx
│   │   ├── ConversationList.tsx
│   │   ├── ConversationItem.tsx
│   │   ├── FilterPills.tsx
│   │   ├── ChatWindow.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── LeadInfoBar.tsx
│   │   ├── ModeToggle.tsx
│   │   ├── AssignDropdown.tsx
│   │   └── StatsBar.tsx
│   └── types/index.ts
├── middleware.ts
├── .env.example
├── .env.local
├── .gitignore
├── tailwind.config.ts
├── next.config.ts
├── package.json
└── README.md
```

---

## Build order

1. Scaffold Next.js 14 + TypeScript + Tailwind
2. Install: `@supabase/supabase-js`, `@supabase/ssr`
3. Create `.env.example` and `.env.local`
4. Run database schema SQL in Supabase
5. Create `src/lib/supabase.ts` (server + browser clients)
6. Create `src/lib/auth.ts`
7. Create `middleware.ts`
8. Create `/login` page with Supabase Auth
9. Create `src/lib/whatsapp.ts`
10. Create `src/lib/system-prompt.ts`
11. Create `src/lib/openrouter.ts`
12. Create `src/lib/ai-mode.ts`
13. Create `src/lib/ai-handler.ts`
14. Create webhook API route
15. Create all conversation API routes
16. Create users API routes
17. Build all UI components
18. Build inbox page wired to Supabase realtime
19. Build README.md
20. Verify production build passes with zero errors

---

## Implementation rules

- No `TODO` placeholders — every function fully implemented
- All server-side DB operations use `SUPABASE_SERVICE_ROLE_KEY` via `createServerClient()`
- Never use the anon key server-side
- Webhook returns 200 immediately — process AI async if needed to avoid Meta timeout
- Always deduplicate on `whatsapp_message_id` before inserting messages
- Use `@supabase/ssr` for cookie-based auth — not the legacy `auth-helpers-nextjs`
- RLS is disabled — enforce access control at the API route level using session user

---

## Current State (Post Phase 1)

The system now extends well beyond the original spec. This section reflects what is in `src/` today.

### Brands & channels

- `Brand` is now `text` (any pipeline-id string), not a fixed `'TBS' | 'RD'` enum.
- Channels supported: WhatsApp + Instagram (same webhook endpoint, payload-shape-detected).
- Per-brand credentials, prompts, pipelines, and default mode live in dedicated tables (see schema diff).

### Schema diff vs Phase 1

New tables: `contacts`, `conversation_events`, `admin_events`, `reply_templates`, `brand_channels`, `brand_contexts`, `brand_pipelines`, `brand_settings`, `tag_taxonomy`.

New columns on `conversations`: `contact_id`, `ai_abstained`, `callback_required`, `needs_human_reply`, `manually_set_human`, `instagram_id`, `pushed_to_crm`, `crm_deal_id`, `crm_stage_id`, `crm_stage_name`, `pushed_to_crm_at`, `pushed_by_user_id`, `suggested_reply`, `suggested_reply_at`, `snoozed_until`, `unread_count`, `last_message_preview`, `lead_score`, `tags[]`.

New columns on `messages`: `delivered_status`, `send_error`, `delivered_at`, `read_at`.

Functions: `increment_unread(conv_id uuid)` (atomic unread bump from webhook), `is_admin()` + `user_can_see_brand_channel(text, text)` (RLS helpers, SECURITY DEFINER).

> **Note:** `conversations.{city, wedding_date, guest_count, budget_range, service_type}` are vestigial after the `contacts` table landed. The conversations API JOINs `contacts` and flattens these fields into the response. Treat the conversation columns as dead — write goes through `contact-merge.ts`.

### RLS

RLS is **enabled** on every table (final state after `migrations/2026_05_hardening.sql`). The service-role key bypasses RLS on the server. RLS only governs the browser-side Realtime channel, which uses the anon key — that's where the policies actually matter.

### AI provider

OpenRouter (spec) has been replaced with **Groq** (`src/lib/llm.ts`). Default model `llama-3.3-70b-versatile`, with `GROQ_FALLBACK_MODELS` chain on 429/5xx. 25 s `AbortController` timeout per call.

### Mode resolution (updated)

`src/lib/ai-mode.ts` runs on every inbound:

1. New conversation → `brand_settings.default_mode` (`AI` or `HUMAN`). If HUMAN, also stamps `manually_set_human=true` so it stays.
2. Existing conversation with `manually_set_human=true` → HUMAN (operator override).
3. `last_human_message_at` null → AI.
4. `last_human_message_at` ≤ window (`ai_reactivation_window_days` ?? 30 days) → HUMAN.
5. Older → AI (reactivation).

### What the AI handler does (`src/lib/ai-handler.ts`)

- Ensures a `contact_id` is linked (via `findOrCreateContact`).
- Builds a per-brand system prompt (`brand_contexts.system_prompt`, falling back to `system-prompt.ts`).
- Calls Groq, strips `<think>` blocks, splits `<qualification_data>` JSON from the user-visible reply.
- **ABSTAIN** → conversation marked `mode=HUMAN`, `ai_abstained=true`, `needs_human_reply=true`. Does NOT touch `manually_set_human` or `last_human_message_at` (the 30-day reactivation window must keep working).
- **HUMAN mode** → save reply as `suggested_reply` instead of sending; preserve previous suggestion if RM hasn't consumed it.
- **AI mode** → INSERT outbound as `PENDING`, send via Meta, mark `SENT`/`FAILED`.
- **`is_qualified`** → flip status to `QUALIFIED`, mode to `HUMAN`, stamp `manually_set_human=true` (auto-handoff).

### Callback detection

`src/lib/ai-handler.ts:19-25` — hardcoded English/Hinglish phrase list, case-insensitive substring match against AI reply + inbound text. Sets `callback_required=true` (cleared on next AI turn that doesn't repeat the phrase, or on RM reply).

### CRM (MySQL) push

- Endpoint: `POST /api/conversations/[id]/push-to-crm`.
- Pipeline/stage resolution order: `brand_pipelines` row → `CRM_PIPELINE_<BRAND>_ID` env → numeric-brand fallback + `CRM_DEFAULT_INITIAL_STAGE_ID`.
- Three MySQL writes: `INSERT persons … ON DUPLICATE KEY UPDATE`, SELECT person_id, `INSERT deals`.
- Each step wrapped with rollback of the Supabase lock on failure (see Phase 1.5 below).
- Single-conversation stage refresh: `POST /api/conversations/refresh-stages?conversation_id=<uuid>` (no param = bulk refresh).

### Required env vars

```
# WhatsApp / Meta (webhook signature + verification)
WHATSAPP_APP_SECRET=            # HMAC verification for inbound webhook
WHATSAPP_VERIFY_TOKEN=          # GET-handshake token; same value also accepted as INSTAGRAM_VERIFY_TOKEN
INSTAGRAM_VERIFY_TOKEN=

# Long-lived Meta tokens (per brand). Pattern:
#   WHATSAPP_TOKEN_<BRAND>     — Cloud API system-user token for sending WA messages
#   INSTAGRAM_TOKEN_<BRAND>    — Page access token covering the IG Business Account
# <BRAND> is the brand string from brand_channels, uppercased.
# Tokens NEVER live in Postgres — they are read from these env vars at send time.
WHATSAPP_TOKEN_TBS=
WHATSAPP_TOKEN_RD=
INSTAGRAM_TOKEN_TBS=
INSTAGRAM_TOKEN_RD=

# Groq
GROQ_API_KEY=
GROQ_MODEL=                     # default llama-3.3-70b-versatile
GROQ_FALLBACK_MODELS=           # csv of fallback model ids

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# TBS CRM (MySQL)
CRM_MYSQL_HOST=
CRM_MYSQL_PORT=
CRM_MYSQL_USER=
CRM_MYSQL_PASSWORD=
CRM_MYSQL_DATABASE=             # default 'thebrideside'

# Optional pipeline mapping (any one path is enough)
CRM_PIPELINE_<BRAND>_ID=
CRM_PIPELINE_<BRAND>_INITIAL_STAGE_ID=
CRM_DEFAULT_INITIAL_STAGE_ID=

# Hardening
STRICT_BRAND_PROMPT=            # set to "1" in prod to refuse generic fallback
WEBHOOK_RATE_WINDOW_MS=         # default 60000
WEBHOOK_RATE_MAX=               # default 30 inbound messages per sender per window

# Observability (Sentry)
SENTRY_DSN=                     # server/edge runtime DSN
NEXT_PUBLIC_SENTRY_DSN=         # same DSN exposed to the browser bundle

# App
NEXT_PUBLIC_APP_URL=
```

---

## Phase 1.5 P0 fixes (applied)

1. **ABSTAIN no longer locks AI out forever.** `src/lib/ai-handler.ts` ABSTAIN path no longer sets `manually_set_human=true` or stamps `last_human_message_at`. The conversation still flips to HUMAN with `ai_abstained=true` for the inbox indicator, but the 30-day reactivation window remains intact.
2. **Push-to-CRM idempotency.** `src/app/api/conversations/[id]/push-to-crm/route.ts` now acquires an atomic lock via a conditional `UPDATE conversations SET pushed_by_user_id=…, pushed_to_crm_at=… WHERE id=… AND pushed_to_crm=false AND pushed_by_user_id IS NULL`. Concurrent clicks race here; the loser returns 409.
3. **Push-to-CRM body validation.** Replaces `as PushBody` with a `validatePushBody` runtime check (lengths, types, numeric ranges). Returns 400 on bad input.
4. **MySQL writes wrapped.** Each of the three writes (person upsert, person id lookup, deal insert) is now in its own try/catch. On failure: `releaseLock()` then a 502 with `step` and `details` so the modal can surface what broke.
5. **`person_id` null guard.** If the post-insert SELECT returns no row, the deal is NOT inserted; lock is released and the route returns 502.
6. **Supabase update after CRM success hard-fails.** Returns 502 with `crm_deal_id` in the body so the UI can recover (deal exists in CRM but Supabase didn't get the linkage).
7. **Qualification preserve-existing.** `applyQualificationUpdates` in `src/lib/contact-merge.ts` only writes when the contact's current field is null. One bad LLM extraction can no longer overwrite a confirmed value.
8. **Brand-prompt fallback safety net.** `getBrandSystemPrompt` now always logs a warning when falling back; if `STRICT_BRAND_PROMPT=1`, it throws `MissingBrandPromptError`. The AI handler catches that and ABSTAINs instead of sending generic copy on a brand that's expected to have its own prompt.
9. **Webhook per-sender rate limit.** `src/lib/rate-limit.ts` is an in-memory token bucket keyed by `(channel, brand, sender)`. Defaults: 30 inbound messages per 60 s. When tripped: the inbound message is still stored and `needs_human_reply` flipped, but the AI call is skipped — protects against Groq bill spikes and Meta-API throttle from a runaway loop. Best-effort per-instance; a Redis-backed limiter is on the P1 list.
10. **Single-conversation stage refresh.** `POST /api/conversations/refresh-stages?conversation_id=<uuid>` refreshes one deal; the DetailRail CRM section now has a "Refresh stage from CRM" button that calls it.

### Still TODO from the original P0 list

- **`crm_stage_name` cache freshness** — the refresh button helps but a true fix needs either polling on focus or a CRM→Supabase webhook.

Deferred — needs a CRM-side change.

---

## Phase 1.6 — Observability + tokens out of DB

### Sentry

`@sentry/nextjs` is now wired. Three runtime configs:

- `sentry.client.config.ts` — browser, gated on `NEXT_PUBLIC_SENTRY_DSN`
- `sentry.server.config.ts` — Node.js serverless, gated on `SENTRY_DSN`
- `sentry.edge.config.ts` — Edge runtime, gated on `SENTRY_DSN`

`instrumentation.ts` loads the runtime-appropriate config when Next.js starts (`experimental.instrumentationHook = true` in `next.config.mjs`). When the DSN env vars are unset the SDK no-ops, so local dev stays quiet.

`Sentry.captureException` is called from:

- `src/app/api/webhook/route.ts` — top-level POST catch + both `waitUntil` AI-handler catches (WhatsApp + Instagram), tagged with `component`, `channel`, `brand`, `conversation_id`.
- `src/lib/ai-handler.ts` — Meta send failures.
- `src/app/api/conversations/[id]/push-to-crm/route.ts` — each of the four error paths (`person_insert`, `person_lookup`, `deal_insert`, `supabase_update`), tagged with `step` so Sentry groups them per stage.

`SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are surfaced in **/admin → System → Environment variables** under a new "Observability (Sentry)" group, so admins see at a glance whether monitoring is wired.

### Tokens moved out of the database

`brand_channels.access_token` is no longer read or written by the application. Tokens are read at send time from env vars keyed by brand:

```
WHATSAPP_TOKEN_<BRAND>      e.g. WHATSAPP_TOKEN_TBS
INSTAGRAM_TOKEN_<BRAND>     e.g. INSTAGRAM_TOKEN_TBS
```

Helpers in `src/lib/brand-channels.ts`:

- `tokenEnvKey(brand, channel)` — returns the env-var name for a brand+channel.
- `getBrandToken(brand, channel)` — reads the env var, returns `null` if unset.
- `getBrandChannel(supabase, brand, channel)` — returns `external_account_id` + `display_name` from the row, paired with the token from env. Returns `null` if either piece is missing.
- `getBrandFromExternalId(supabase, externalAccountId, channel)` — reverse lookup used by the webhook; no longer returns a token.

API surface changes:

- `GET /api/brand-channels` — drops `access_token_preview`. Returns `token_env_key` and `token_env_set` (boolean) so the UI can render a "env set / env missing" pill.
- `PATCH /api/brand-channels/[id]` — rejects `access_token` payloads with a 400 explaining the new flow. Still accepts `external_account_id` changes; if the env token is set we re-validate against Meta, otherwise we save the row and warn.
- `POST /api/onboarding/channel` — no longer accepts an `access_token` body field. Validates only when `WHATSAPP_TOKEN_<BRAND>` / `INSTAGRAM_TOKEN_<BRAND>` is already set in the environment. If not, the row is saved with `display_name=null` and the response includes `{ warning: "Set X in your environment to enable sending." }`.
- Admin **Channels** tab — token field is gone. Each row shows `Token: WHATSAPP_TOKEN_<BRAND>` with a green "env set" or red "env missing" pill. The Connect-channel modal shows an instruction box pointing the admin to Vercel env settings.

DB cleanup: `migrations/2026_05_drop_brand_channel_tokens.sql` drops the now-unused `access_token` column. Run after all `WHATSAPP_TOKEN_<BRAND>` / `INSTAGRAM_TOKEN_<BRAND>` env vars are populated in production.

### Rotating a token

1. Generate a new token in Meta Business Manager.
2. Update `WHATSAPP_TOKEN_<BRAND>` / `INSTAGRAM_TOKEN_<BRAND>` in your Vercel project → Settings → Environment Variables.
3. Redeploy (Vercel does this automatically for non-Preview envs on save).
4. Hard-refresh `/admin → Channels` — the pill should flip back to "env set".

No DB write, no app restart beyond the redeploy, no token ever touches Postgres.

---

## Env var naming convention (multi-brand)

The token env-var name is computed at runtime in `src/lib/brand-channels.ts:14-16`:

```ts
const prefix = channel === 'IG' ? 'INSTAGRAM_TOKEN' : 'WHATSAPP_TOKEN';
return `${prefix}_${String(brand).toUpperCase()}`;
```

So **only two** per-brand token env vars exist — one per channel. Phone number IDs and IG Business Account IDs are NOT env vars; they live in the `brand_channels.external_account_id` column, set from `/admin → Channels`.

### Per-brand env vars

For each brand you onboard, add (at minimum):

| Env var | Purpose | Required? |
|---|---|---|
| `WHATSAPP_TOKEN_<BRAND>` | Long-lived Meta Cloud API system-user token; used for sending WA messages | If the brand has a WhatsApp channel |
| `INSTAGRAM_TOKEN_<BRAND>` | Page access token covering the IG Business Account | If the brand has an Instagram channel |
| `CRM_PIPELINE_<BRAND>_ID` | Numeric CRM pipeline id (optional — use this OR a `brand_pipelines` Supabase row) | Optional |
| `CRM_PIPELINE_<BRAND>_INITIAL_STAGE_ID` | Numeric CRM stage id new deals start in (optional — same alternative as above) | Optional |

`<BRAND>` is the brand string from `brand_channels.brand`, uppercased. So if the row has `brand='tbs'` or `brand='TBS'`, both resolve to `WHATSAPP_TOKEN_TBS`.

### Global env vars (not per-brand)

| Env var | Purpose |
|---|---|
| `WHATSAPP_APP_SECRET` | HMAC verification for inbound webhook (Meta App Dashboard → Settings → Basic) |
| `WHATSAPP_VERIFY_TOKEN` | GET-handshake token for the WA webhook subscription |
| `INSTAGRAM_VERIFY_TOKEN` | GET-handshake token for the IG webhook subscription (can be the same string as WA's) |
| `CRM_DEFAULT_INITIAL_STAGE_ID` | Fallback initial stage when `brand_pipelines` + `CRM_PIPELINE_<BRAND>_INITIAL_STAGE_ID` are both unset |

### Copy-paste env block: TBS + RD

```
# Per-brand tokens (required)
WHATSAPP_TOKEN_TBS=
INSTAGRAM_TOKEN_TBS=
WHATSAPP_TOKEN_RD=
INSTAGRAM_TOKEN_RD=

# Per-brand CRM pipeline mapping (optional — DB row in brand_pipelines is preferred)
# CRM_PIPELINE_TBS_ID=
# CRM_PIPELINE_TBS_INITIAL_STAGE_ID=
# CRM_PIPELINE_RD_ID=
# CRM_PIPELINE_RD_INITIAL_STAGE_ID=
```

Adding a third brand (say `RV` for Revaah) just means adding `WHATSAPP_TOKEN_RV` and `INSTAGRAM_TOKEN_RV`. No code change.

---

## Channel-connection flow (current)

The signup wizard at `/signup` has three steps — **Account → Brands → Review** (`src/app/signup/SignupClient.tsx:10`). There is no "Connect WhatsApp" step in signup any more; channel creation is admin-only. Agents inherit whichever channels an admin has already wired up for the brands they pick.

### Connecting a new brand's WhatsApp / Instagram (admin-only)

1. **Set the env var(s) in Vercel first.**
   - Vercel project → Settings → Environment Variables → Add.
   - Name: `WHATSAPP_TOKEN_<BRAND>` and/or `INSTAGRAM_TOKEN_<BRAND>` (brand uppercased, e.g. `WHATSAPP_TOKEN_RD`).
   - Value: long-lived system-user token from Meta Business Manager.
   - Apply to Production (and Preview if you want it on PR deploys).
   - Redeploy — Vercel triggers automatically on env-var save.

2. **Go to `/admin → Channels` → "+ Connect channel".**
   - Pick the brand (sourced from CRM pipelines).
   - Pick WhatsApp or Instagram.
   - The modal live-checks `GET /api/brand-channels/env-check` and shows a green "env set" pill (or red "env missing" if step 1 isn't done — you can still save, but sending won't work yet).
   - Enter the Meta account ID (WA phone number ID or IG Business Account ID).
   - Submit. If the env token is present we validate the credential pair against Meta and store the verified display name; if not, we save the row anyway and surface a warning banner asking you to finish step 1.

3. **Verify in the list.**
   - Each row shows `Token: WHATSAPP_TOKEN_<BRAND>` with an "env set / env missing" pill so you can confirm at a glance.
   - If the pill says "env missing", finish step 1 and redeploy; then refresh the page.

4. **Rotate later** by editing the env var in Vercel and redeploying. The Channels tab "Edit" button only edits the account ID; the rotate-token instruction box points you back to Vercel.

### Why this flow

Tokens never touch Postgres, so a Supabase compromise can't leak Meta credentials. Rotation is a Vercel-only operation — no DB writes, no app restart, no token in the UI. The trade-off is one extra step (env var first, then UI) when onboarding a new brand. The in-modal env-check makes that step impossible to forget.

### Endpoints involved

- `GET /api/brand-channels` — list rows + per-row `token_env_key` + `token_env_set`.
- `GET /api/brand-channels/env-check?brand=…&channel=…` — admin-only; returns `{ token_env_key, token_env_set }` for any brand+channel pair (used by the connect modal before save).
- `POST /api/onboarding/channel` — admin creates the row; validates against Meta when the env token is set, returns `{ warning }` when it isn't.
- `PATCH /api/brand-channels/[id]` — admin edits account ID; re-validates against Meta when the env token is set. Rejects `access_token` payloads with a 400 explaining the new flow.
- `DELETE /api/brand-channels/[id]` — admin disconnects.

