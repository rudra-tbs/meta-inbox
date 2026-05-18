// LLM wrapper. Despite the filename, this now calls Groq's OpenAI-compatible
// chat-completions endpoint — Groq's free tier (14,400 req/day on Llama 3.3
// 70B) gives us much more headroom than OpenRouter's :free shared cap.
// Filename kept to avoid an import churn; rename later if we add a second provider.

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

interface ChatMessage {
  role: string;
  content: string;
}

async function callGroq(
  model: string,
  messages: ChatMessage[]
): Promise<{ content: string; model: string }> {
  const res = await fetch(GROQ_ENDPOINT, {
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
  });

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
// rate-limits, errors, or 5xxs. Each model is tried at most once.
export async function callOpenRouter(messages: ChatMessage[]): Promise<string> {
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
      if (err instanceof GroqError && (err.status === 429 || err.status >= 500)) {
        console.warn(`[Groq] ${model} → ${err.status}, trying next model in chain`);
        continue;
      }
      throw err;
    }
  }

  throw lastErr ?? new Error('All Groq models failed');
}
