export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { waitUntil } from '@vercel/functions';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { handleAIResponse } from '@/lib/ai-handler';
import { logEvent } from '@/lib/activity';
import type { Conversation } from '@/types';

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
  const { mode } = body as { mode: 'AI' | 'HUMAN' };

  if (!mode || !['AI', 'HUMAN'].includes(mode)) {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  }

  // Read the previous last_human_message_at so we can preserve it in the
  // audit log even if we clear it on the row.
  const { data: prev } = await supabase
    .from('conversations')
    .select('last_human_message_at')
    .eq('id', params.id)
    .single();
  const prevLastHuman = prev?.last_human_message_at ?? null;

  const updates: Record<string, unknown> = {
    mode,
    // Either direction implies a human took ownership of the flow, so clear
    // the AI-bail indicator. It'll only reappear if the AI bails again.
    ai_abstained: false,
    updated_at: new Date().toISOString(),
  };

  if (mode === 'HUMAN') {
    updates.last_human_message_at = new Date().toISOString();
    updates.manually_set_human = true;
  } else {
    // Toggle to AI: respect the operator's choice — the next inbound goes
    // straight to AI regardless of the 30-day window. The previous
    // last_human_message_at is captured in the MODE_CHANGED event below for
    // SLA reporting, and remains derivable from the messages table.
    updates.last_human_message_at = null;
    updates.manually_set_human = false;
  }

  const { data: updated, error } = await supabase
    .from('conversations')
    .update(updates)
    .eq('id', params.id)
    .select('*, assigned_user:users!assigned_to(name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logEvent(supabase, params.id, 'MODE_CHANGED', {
    actorUserId: appUser.id,
    actorName: appUser.name,
    metadata: { to: mode, prev_last_human_message_at: prevLastHuman },
  });

  // If switching to AI, check if the last message is unanswered inbound — if so, trigger AI immediately
  if (mode === 'AI') {
    const { data: lastMessage } = await supabase
      .from('messages')
      .select('direction, content')
      .eq('conversation_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastMessage?.direction === 'INBOUND') {
      waitUntil(
        handleAIResponse(supabase, updated as Conversation, lastMessage.content).catch((err) => {
          console.error('AI handler error on mode switch:', err);
        })
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assignedUser = (updated as any).assigned_user;
  return NextResponse.json({
    ...updated,
    assigned_user: undefined,
    assigned_user_name: assignedUser?.name ?? null,
  });
}
