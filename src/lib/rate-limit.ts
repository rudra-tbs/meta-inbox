// In-memory per-sender rate limiter for inbound webhooks.
//
// On Vercel each function instance has its own map, so this is a best-effort
// per-instance cap, not a strict global limit. For a strict limit move to
// Upstash Ratelimit (Redis-backed) — see P1. The purpose here is to defend
// against a single phone-number / IG-id spamming us into a Groq bill spike
// or Meta-API throttle. Real rate-limit at the platform layer is still TBD.
//
// Default window: 30 inbound text messages per sender per 60 seconds. That
// covers a typing-fast lead, blocks a runaway loop. Tune via env if needed.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = parseInt(process.env.WEBHOOK_RATE_WINDOW_MS || '60000', 10);
const MAX_PER_WINDOW = parseInt(process.env.WEBHOOK_RATE_MAX || '30', 10);
const MAX_KEYS = 5000; // hard cap so a memory leak under DDoS is bounded

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export function checkInboundRate(senderKey: string): RateLimitResult {
  const now = Date.now();
  let b = buckets.get(senderKey);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    if (buckets.size >= MAX_KEYS) {
      // Evict the oldest few keys to keep the map bounded under attack.
      const toDrop = Math.ceil(MAX_KEYS / 10);
      const keys = Array.from(buckets.keys()).slice(0, toDrop);
      for (const k of keys) buckets.delete(k);
    }
    buckets.set(senderKey, b);
  }
  b.count += 1;
  const allowed = b.count <= MAX_PER_WINDOW;
  return { allowed, remaining: Math.max(0, MAX_PER_WINDOW - b.count), resetMs: b.resetAt - now };
}
