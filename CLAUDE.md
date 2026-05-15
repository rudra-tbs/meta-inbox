# Acceltancy Inbox — Claude Code Build Spec
# Phase 1: TBS WhatsApp · Standalone · No CRM integration

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