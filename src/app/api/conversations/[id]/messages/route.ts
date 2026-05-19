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
  // as a tiebreak via the composite index.
  let query = supabase
    .from('messages')
    .select(`*, sender_user:users!sender_user_id(name)`)
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) query = query.lt('created_at', before);

  const { data: messages, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (messages ?? [])
    .map((m) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const senderUser = (m as any).sender_user;
      return {
        ...m,
        sender_user: undefined,
        sender_name: senderUser?.name ?? null,
      };
    })
    .reverse();

  return NextResponse.json(result);
}
