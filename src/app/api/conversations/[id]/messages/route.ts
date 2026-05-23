export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServerClient();
  const appUser = await getUserByAuthId(user.id);
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT)) || DEFAULT_LIMIT)
  );
  // "before" is the ISO created_at of the oldest message the client already has;
  // we return the next page of older messages before that timestamp.
  const before = searchParams.get('before');

  // Pull the most-recent `limit` messages (descending), then reverse for the UI
  // which renders oldest-first. Cursor pagination uses created_at desc + id
  // as a tiebreak via the composite index. LEFT JOIN ai_message_feedback so
  // the MessageBubble knows up-front whether an AI message has been rated.
  let query = supabase
    .from('messages')
    .select(`
      *,
      sender_user:users!sender_user_id(name),
      feedback:ai_message_feedback!message_id(rating, reason)
    `)
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) query = query.lt('created_at', before);

  const { data: messages, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (messages ?? [])
    .map((m) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = m as any;
      const senderUser = row.sender_user;
      // PostgREST returns embedded rows as an array even for a 1:1 FK.
      // Take the first; if no feedback row exists, both fields stay null.
      const feedback = Array.isArray(row.feedback) ? row.feedback[0] : row.feedback;
      return {
        ...row,
        sender_user: undefined,
        feedback: undefined,
        sender_name: senderUser?.name ?? null,
        feedback_rating: feedback?.rating ?? null,
        feedback_reason: feedback?.reason ?? null,
      };
    })
    .reverse();

  return NextResponse.json(result);
}
