# The Bride Side — WhatsApp AI Agent

A production-ready WhatsApp AI agent for **The Bride Side** (Acceltancy). Qualifies inbound wedding planning leads via conversational AI, routes to human RMs when ready, and surfaces all conversations in a real-time dashboard.

Built with Next.js 14, Supabase, OpenRouter, and the Meta Cloud API.

---

## What it does

- Receives inbound WhatsApp messages via Meta Cloud API webhook
- Runs an AI assistant (via OpenRouter) that collects city, wedding date, guest count, budget, and service type
- Marks leads as **Qualified** once all 5 data points are collected
- Lets any RM **take over** the conversation from the dashboard (Human mode)
- Shows a real-time dashboard with all conversations, messages, lead info, and today's stats

---

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the full schema from `CLAUDE.md` (the `Database schema` section)
3. Copy your **Project URL**, **Anon key**, and **Service role key** from Settings → API

### 2. Meta / WhatsApp

1. Go to [developers.facebook.com](https://developers.facebook.com) → Create App → Business
2. Add **WhatsApp** product
3. Under WhatsApp → API Setup, note your **Phone Number ID**
4. Set a **Webhook URL**: `https://your-domain.com/api/webhook`
5. Set a **Verify Token** (any string — must match `WHATSAPP_VERIFY_TOKEN` in your env)
6. Subscribe to the `messages` webhook field

### 3. OpenRouter

1. Sign up at [openrouter.ai](https://openrouter.ai)
2. Go to Settings → API Keys → Create key
3. Choose a model (e.g. `anthropic/claude-3-haiku` for quality, `minimax/minimax-01` for free tier)

### 4. Environment variables

Copy `.env.example` to `.env.local` and fill in all values:

```bash
cp .env.example .env.local
```

---

## Run locally with ngrok

Meta's webhook requires a public HTTPS URL. Use ngrok to expose localhost:

```bash
# Terminal 1 — start the dev server
npm run dev

# Terminal 2 — expose it publicly
ngrok http 3000
```

Copy the ngrok URL (e.g. `https://abc123.ngrok.io`) and:
- Set it as your webhook URL in Meta: `https://abc123.ngrok.io/api/webhook`
- Set `NEXT_PUBLIC_APP_URL=https://abc123.ngrok.io` in `.env.local`

---

## Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Then in Vercel dashboard → Project → Settings → Environment Variables, add all keys from `.env.local`.

After deploy, update your Meta webhook URL to the Vercel domain and re-verify.

---

## Get a permanent Meta access token (System User)

Temporary tokens expire every 60 days. For production:

1. Go to [business.facebook.com](https://business.facebook.com) → Settings → Users → System Users
2. Create a system user with **Admin** role
3. Assign your WhatsApp app and phone number to the system user
4. Generate a token with `whatsapp_business_messaging` and `whatsapp_business_management` permissions
5. This token never expires — use it as `WHATSAPP_ACCESS_TOKEN`

---

## Update the system prompt

Edit `src/lib/system-prompt.ts`. The exported `SYSTEM_PROMPT` string is what the AI receives as its system message on every conversation. Changes take effect immediately on the next incoming message — no rebuild required in production (env var changes do require a redeploy).

---

## Phase 2 notes

The database schema includes a `brand` column (`TBS` | `RD`) to support **Revaah Decor** in Phase 2. The column defaults to `TBS` for all Phase 1 conversations. Adding RD will require a new system prompt variant and brand-routing logic in the webhook handler — no schema migration needed.
