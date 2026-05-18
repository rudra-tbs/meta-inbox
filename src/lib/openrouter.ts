export async function callOpenRouter(messages: Array<{ role: string; content: string }>) {
  const primary = process.env.OPENROUTER_MODEL;
  const fallbacks = (process.env.OPENROUTER_FALLBACK_MODELS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const models = [primary, ...fallbacks].filter(Boolean) as string[];

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? '',
      'X-Title': 'Acceltancy Inbox',
    },
    body: JSON.stringify({
      model: primary,
      models,
      messages,
      max_tokens: 300,
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);
  const data = await res.json();
  if (data.model && data.model !== primary) {
    console.log(`[OpenRouter] primary failed; used fallback: ${data.model}`);
  }
  return data.choices[0].message.content as string;
}
