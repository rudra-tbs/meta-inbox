export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { logEvent } from '@/lib/activity';

export async function POST(
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

  const body = await request.json();
  const { userId } = body as { userId: string | null };

  // Access control: agents can only self-assign or unassign themselves
  if (appUser.role === 'AGENT') {
    if (userId !== null && userId !== appUser.id) {
      return NextResponse.json({ error: 'Agents can only self-assign' }, { status: 403 });
    }
  }

  const now = new Date().toISOString();

  // Fetch the conversation first so we can validate the assignee actually has
  // access to its brand+channel. Without this check, an admin could assign a
  // conversation to a user who can't see it, orphaning the thread.
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('brand, channel')
    .eq('id', params.id)
    .single();
  if (convErr || !conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  let assignedUserName: string | null = null;
  if (userId) {
    const { data: assignedUser } = await supabase
      .from('users')
      .select('name, role')
      .eq('id', userId)
      .single();
    if (!assignedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 400 });
    }
    assignedUserName = assignedUser.name;

    // Admins see everything by default. For agents, verify they have an
    // access row for this brand+channel.
    if (assignedUser.role !== 'ADMIN') {
      const { data: access } = await supabase
        .from('user_access')
        .select('id')
        .eq('user_id', userId)
        .eq('brand', conv.brand)
        .eq('channel', conv.channel)
        .maybeSingle();
      if (!access) {
        return NextResponse.json(
          { error: `${assignedUser.name} does not have access to ${conv.brand}/${conv.channel}.` },
          { status: 400 }
        );
      }
    }
  }

  const { data: updated, error } = await supabase
    .from('conversations')
    .update({ assigned_to: userId, updated_at: now })
    .eq('id', params.id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logEvent(supabase, params.id, 'ASSIGNED', {
    actorUserId: appUser.id,
    actorName: appUser.name,
    metadata: { assigned_to: userId, assigned_name: assignedUserName },
  });

  return NextResponse.json({
    ...updated,
    assigned_user_name: assignedUserName,
  });
}
