export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getUserByAuthId } from '@/lib/auth';
import { callLLM } from '@/lib/llm';
import { extractCleanText, extractQualData } from '@/lib/ai-response';

async function requireAdmin() {
  const cookieStore = cookies();
  const supabase = createSupabaseSSR(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const appUser = await getUserByAuthId(user.id);
  if (!appUser || appUser.role !== 'ADMIN') return null;
  return appUser;
}

interface PreviewBody {
  system_prompt: string;
  user_message: string;
}

// Dry-run an AI reply against a system prompt without touching any
// conversation. Used by /admin → Brand contexts so admins can iterate
// on prompts and see the actual output (clean text + parsed qualification
// JSON + raw) before saving the prompt and shipping it to real leads.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: PreviewBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const systemPrompt = String(body?.system_prompt ?? '').trim();
  const userMessage = String(body?.user_message ?? '').trim();

  if (!systemPrompt) return NextResponse.json({ error: 'system_prompt is required' }, { status: 400 });
  if (systemPrompt.length > 20000) return NextResponse.json({ error: 'system_prompt is too long (max 20k chars)' }, { status: 400 });
  if (!userMessage) return NextResponse.json({ error: 'user_message is required' }, { status: 400 });
  if (userMessage.length > 2000) return NextResponse.json({ error: 'user_message is too long (max 2k chars)' }, { status: 400 });

  const t0 = Date.now();
  let raw: string;
  try {
    raw = await callLLM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'LLM call failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  const latencyMs = Date.now() - t0;

  const abstained = /^\s*ABSTAIN\s*$/i.test(raw);
  const cleanText = abstained ? null : extractCleanText(raw);
  const qualData = abstained ? null : extractQualData(raw);

  return NextResponse.json({
    raw,
    clean_text: cleanText,
    qual_data: qualData,
    abstained,
    latency_ms: latencyMs,
  });
}
