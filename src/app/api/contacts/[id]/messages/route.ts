export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';

// Returns messages from ALL conversations belonging to this contact,
// interleaved chronologically, with channel/brand stamped on each row.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
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

  const { data: convs } = await supabase
    .from('conversations')
    .select('id, channel, brand')
    .eq('contact_id', params.id);

  if (!convs || convs.length === 0) return NextResponse.json([]);

  const convIds = convs.map((c) => c.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelById: Record<string, any> = {};
  for (const c of convs) channelById[c.id] = { channel: c.channel, brand: c.brand };

  const { data: msgs, error } = await supabase
    .from('messages')
    .select('*, sender_user:users!sender_user_id(name)')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (msgs ?? []).map((m: any) => ({
    ...m,
    sender_user: undefined,
    sender_name: m.sender_user?.name ?? null,
    channel: channelById[m.conversation_id]?.channel ?? null,
    brand: channelById[m.conversation_id]?.brand ?? null,
  }));

  return NextResponse.json(result);
}
