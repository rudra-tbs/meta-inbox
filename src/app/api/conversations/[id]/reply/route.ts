export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

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
  const { message } = body as { message: string };

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  // Get conversation
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', params.id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const now = new Date().toISOString();

  // Insert message first so it shows in UI immediately, then send
  const { data: insertedMsg } = await supabase
    .from('messages')
    .insert({
      conversation_id: params.id,
      direction: 'OUTBOUND',
      sender: 'HUMAN',
      sender_user_id: appUser.id,
      content: message.trim(),
      whatsapp_message_id: null,
      created_at: now,
    })
    .select('id')
    .single();

  try {
    const waId = await sendWhatsAppMessage(conversation.phone_number, message.trim());
    if (waId && insertedMsg?.id) {
      await supabase.from('messages').update({ whatsapp_message_id: waId }).eq('id', insertedMsg.id);
    }
  } catch (err) {
    console.error('[Reply] WhatsApp send failed:', err);
  }

  // Update conversation — manually_set_human=true prevents ai-mode from re-activating AI
  const { error: updateError } = await supabase
    .from('conversations')
    .update({
      mode: 'HUMAN',
      last_human_message_at: now,
      last_message_at: now,
      needs_human_reply: false,
      manually_set_human: true,
      suggested_reply: null,
      suggested_reply_at: null,
      updated_at: now,
    })
    .eq('id', params.id);

  if (updateError) {
    console.error(`[Reply] conversation update FAILED for ${params.id}:`, updateError);
  } else {
    console.log(`[Reply] conversation ${params.id} → mode=HUMAN, manually_set_human=true, needs_human_reply=false`);
  }

  return NextResponse.json({ ok: true });
}
