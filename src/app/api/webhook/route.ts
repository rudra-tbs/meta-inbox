export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { resolveConversation } from '@/lib/ai-mode';
import { handleAIResponse } from '@/lib/ai-handler';

// GET: WhatsApp webhook verification
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST: Inbound WhatsApp webhook
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const msg = messages[0];

    // Only handle text messages
    if (msg.type !== 'text') {
      return NextResponse.json({ ok: true });
    }

    const fromPhone = msg.from as string;
    const msgId = msg.id as string;
    const textBody = msg.text?.body as string;
    const contactName =
      value?.contacts?.[0]?.profile?.name ?? null;

    // Deduplicate
    const supabase = createServerClient();
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('whatsapp_message_id', msgId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true });
    }

    // Resolve conversation and mode
    const { conversation, mode } = await resolveConversation(
      supabase,
      fromPhone,
      'TBS',
      'WA',
      contactName
    );

    // Insert inbound message
    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      direction: 'INBOUND',
      sender: 'LEAD',
      sender_user_id: null,
      content: textBody,
      whatsapp_message_id: msgId,
      created_at: new Date().toISOString(),
    });

    // Update conversation last_message_at
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', conversation.id);

    console.log(`[Webhook] conversation=${conversation.id} resolved_mode=${mode} → ${mode === 'AI' ? 'calling AI handler' : 'skipping (HUMAN mode)'}`);

    // Fire AI response async (don't await)
    if (mode === 'AI') {
      handleAIResponse(supabase, conversation, textBody).catch((err) => {
        console.error('AI handler error:', err);
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json({ ok: true }); // Always return 200
  }
}
