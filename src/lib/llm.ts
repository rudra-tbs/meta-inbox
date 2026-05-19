// LLM wrapper. Calls Groq's OpenAI-compatible chat-completions endpoint —
// Groq's free tier (14,400 req/day on Llama 3.3 70B) gives us much more
// headroom than OpenRouter's :free shared cap. If we add a second provider
// later, branch inside this module rather than splitting into another file.

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const REQUEST_TIMEOUT_MS = 25_000;

interface ChatMessage {
  role: string;
  content: string;
}

async function callGroq(
  model: string,
  messages: ChatMessage[]
): Promise<{ content: string; model: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 300,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new GroqError(504, `Groq ${model} timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new GroqError(res.status, `Groq ${model} returned ${res.status}: ${bodyText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content as string | undefined;
  if (!content) {
    throw new GroqError(500, `Groq ${model} returned empty content`);
  }
  return { content, model: (data?.model as string) ?? model };
}

class GroqError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'GroqError';
  }
}

// Retry the call across the primary + fallback models when the primary
// rate-limits, errors, times out, or 5xxs. Each model is tried at most once.
export async function callLLM(messages: ChatMessage[]): Promise<string> {
  const primary = process.env.GROQ_MODEL || DEFAULT_MODEL;
  const fallbacks = (process.env.GROQ_FALLBACK_MODELS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const chain = [primary, ...fallbacks];

  let lastErr: unknown = null;
  for (const model of chain) {
    try {
      const { content, model: used } = await callGroq(model, messages);
      if (used !== primary) {
        console.log(`[Groq] primary ${primary} failed; used fallback ${used}`);
      }
      return content;
    } catch (err) {
      lastErr = err;
      // Retry on rate-limit, 5xx, or our injected 504 timeout.
      if (err instanceof GroqError && (err.status === 429 || err.status >= 500)) {
        console.warn(`[Groq] ${model} → ${err.status}, trying next model in chain`);
        continue;
      }
      throw err;
    }
  }

  throw lastErr ?? new Error('All Groq models failed');
}
