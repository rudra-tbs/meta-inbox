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

  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', params.id)
    .single();

  if (convError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const trimmed = message.trim();

  // Insert as PENDING so the UI shows it immediately. Mark SENT or FAILED
  // after the WhatsApp call returns.
  const { data: insertedMsg } = await supabase
    .from('messages')
    .insert({
      conversation_id: params.id,
      direction: 'OUTBOUND',
      sender: 'HUMAN',
      sender_user_id: appUser.id,
      content: trimmed,
      whatsapp_message_id: null,
      delivered_status: 'PENDING',
      created_at: now,
    })
    .select('id')
    .single();

  let sendOk = false;
  let sendError: string | null = null;
  let waId: string | null = null;
  try {
    waId = await sendWhatsAppMessage(conversation.brand, conversation.phone_number, trimmed);
    sendOk = true;
  } catch (err) {
    sendError = err instanceof Error ? err.message : String(err);
    console.error('[Reply] WhatsApp send failed:', err);
  }

  if (insertedMsg?.id) {
    if (sendOk) {
      await supabase
        .from('messages')
        .update({ whatsapp_message_id: waId, delivered_status: 'SENT', send_error: null })
        .eq('id', insertedMsg.id);
    } else {
      await supabase
        .from('messages')
        .update({ delivered_status: 'FAILED', send_error: sendError })
        .eq('id', insertedMsg.id);
    }
  }

  // NOTE on AI reactivation:
  // We DO NOT set manually_set_human=true here. That flag means "operator
  // explicitly disabled AI", which is set by the /mode toggle route and the
  // AI handler's ABSTAIN / auto-handoff paths. Just replying keeps the
  // conversation in HUMAN mode for the 30-day window via last_human_message_at;
  // after 30 days of silence the AI reactivation in lib/ai-mode.ts kicks in.
  // Setting it here would block reactivation forever.
  const { error: updateError } = await supabase
    .from('conversations')
    .update({
      mode: 'HUMAN',
      last_human_message_at: now,
      last_message_at: now,
      last_message_preview: trimmed.slice(0, 500),
      // RM responded → clear any AI-flagged callback need + any prior AI bail.
      callback_required: false,
      needs_human_reply: false,
      ai_abstained: false,
      suggested_reply: null,
      suggested_reply_at: null,
      unread_count: 0,
      updated_at: now,
    })
    .eq('id', params.id);

  if (updateError) {
    console.error(`[Reply] conversation update FAILED for ${params.id}:`, updateError);
  }

  if (!sendOk) {
    return NextResponse.json({ error: 'Message saved but WhatsApp delivery failed', details: sendError }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
