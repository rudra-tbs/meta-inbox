export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId, getConversationFilter } from '@/lib/auth';

export async function GET(request: NextRequest) {
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
  const brand = searchParams.get('brand') || 'TBS';
  const channel = searchParams.get('channel') || 'WA';
  const mode = searchParams.get('mode');
  const status = searchParams.get('status');
  const mine = searchParams.get('mine') === 'true';
  const pending = searchParams.get('pending') === 'true';
  const search = searchParams.get('search');

  // Get access filter
  const filter = await getConversationFilter(appUser.id);

  let query = supabase
    .from('conversations')
    .select(`
      *,
      assigned_user:users!assigned_to(name)
    `)
    .eq('brand', brand)
    .eq('channel', channel)
    .order('last_message_at', { ascending: false });

  // Apply access control for agents
  if (filter) {
    const allowed = filter.allowedBrandChannels as Array<{ brand: string; channel: string }>;
    const isAllowed = allowed.some(
      (a) => a.brand === brand && a.channel === channel
    );
    if (!isAllowed) {
      return NextResponse.json([]);
    }

    // Agents see unassigned + assigned to them
    query = query.or(`assigned_to.is.null,assigned_to.eq.${filter.userId}`);
  }

  if (mode) query = query.eq('mode', mode);
  if (status) query = query.eq('status', status);
  if (mine) query = query.eq('assigned_to', appUser.id);
  if (pending) query = query.or('needs_human_reply.eq.true,callback_required.eq.true');

  if (search) {
    query = query.or(
      `contact_name.ilike.%${search}%,phone_number.ilike.%${search}%`
    );
  }

  const { data: conversations, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch last message for each conversation
  const convIds = (conversations ?? []).map((c) => c.id);
  const lastMessages: Record<string, string> = {};

  if (convIds.length > 0) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('conversation_id, content, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false });

    if (msgs) {
      for (const m of msgs) {
        if (!lastMessages[m.conversation_id]) {
          lastMessages[m.conversation_id] = m.content;
        }
      }
    }
  }

  const result = (conversations ?? []).map((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assignedUser = c.assigned_user as any;
    return {
      ...c,
      assigned_user: undefined,
      last_message: lastMessages[c.id] ?? null,
      assigned_user_name: assignedUser?.name ?? null,
    };
  });

  return NextResponse.json(result);
}
