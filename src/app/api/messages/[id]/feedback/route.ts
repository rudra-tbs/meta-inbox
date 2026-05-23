export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';

// POST /api/messages/[id]/feedback
// Body: { rating: 'up' | 'down', reason?: string }
//
// Upserts a row in ai_message_feedback. Same RM can flip their rating
// (up ↔ down) by POSTing again; we replace rather than version because
// the "what does this RM think NOW" signal is what we want, not history.
//
// DELETE /api/messages/[id]/feedback
//
// Clears the rating. Useful for "actually that's fine, nevermind".
//
// Both endpoints require auth and require the target message to be
// AI-authored — rating LEAD or HUMAN messages doesn't carry any
// useful signal for prompt tuning.

interface PostBody {
  rating?: 'up' | 'down';
  reason?: string | null;
}

async function authed() {
  const cookieStore = cookies();
  const supabaseAuth = createSupabaseSSR(
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
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return null;
  const appUser = await getUserByAuthId(user.id);
  if (!appUser) return null;
  return appUser;
}

async function ensureAiMessage(messageId: string): Promise<NextResponse | null> {
  const supabase = createServerClient();
  const { data: msg, error } = await supabase
    .from('messages')
    .select('id, sender')
    .eq('id', messageId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  if (msg.sender !== 'AI') {
    return NextResponse.json(
      { error: 'Feedback only applies to AI-authored messages' },
      { status: 400 },
    );
  }
  return null;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await authed();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const guard = await ensureAiMessage(params.id);
  if (guard) return guard;

  const body = (await request.json().catch(() => null)) as PostBody | null;
  const rating = body?.rating;
  if (rating !== 'up' && rating !== 'down') {
    return NextResponse.json({ error: 'rating must be "up" or "down"' }, { status: 400 });
  }
  let reason: string | null = null;
  if (body?.reason != null) {
    if (typeof body.reason !== 'string') {
      return NextResponse.json({ error: 'reason must be a string' }, { status: 400 });
    }
    const trimmed = body.reason.trim();
    if (trimmed.length > 1000) {
      return NextResponse.json({ error: 'reason too long (max 1000)' }, { status: 400 });
    }
    reason = trimmed === '' ? null : trimmed;
  }

  const supabase = createServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('ai_message_feedback')
    .upsert(
      {
        message_id: params.id,
        rating,
        reason,
        rated_by_user_id: user.id,
        rated_at: now,
        updated_at: now,
      },
      { onConflict: 'message_id' },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, rating, reason });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const user = await authed();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const guard = await ensureAiMessage(params.id);
  if (guard) return guard;

  const supabase = createServerClient();
  const { error } = await supabase
    .from('ai_message_feedback')
    .delete()
    .eq('message_id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
