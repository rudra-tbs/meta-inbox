export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createServerClient } from '@/lib/supabase';
import { resolveConversation } from '@/lib/ai-mode';
import { handleAIResponse } from '@/lib/ai-handler';
import { verifyWebhookSignature } from '@/lib/webhook-verify';

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
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256');

    if (!verifyWebhookSignature(rawBody, signature)) {
      console.warn('[Webhook] Invalid signature — rejecting');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(rawBody);
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;
    const statuses = value?.statuses;

    // Status updates (delivered / read) — update existing messages
    if (statuses && statuses.length > 0) {
      const supabase = createServerClient();
      for (const s of statuses) {
        const waId = s.id as string;
        const status = s.status as string;
        const ts = s.timestamp ? new Date(parseInt(s.timestamp) * 1000).toISOString() : new Date().toISOString();
        const updates: Record<string, unknown> = {};
        if (status === 'delivered') updates.delivered_at = ts;
        if (status === 'read') {
          updates.read_at = ts;
          // 'read' implies 'delivered' too
          updates.delivered_at = ts;
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from('messages').update(updates).eq('whatsapp_message_id', waId);
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const msg = messages[0];
    if (msg.type !== 'text') {
      return NextResponse.json({ ok: true });
    }

    const fromPhone = msg.from as string;
    const msgId = msg.id as string;
    const textBody = msg.text?.body as string;
    const contactName = value?.contacts?.[0]?.profile?.name ?? null;

    const supabase = createServerClient();
    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('whatsapp_message_id', msgId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true });
    }

    const { conversation, mode } = await resolveConversation(
      supabase,
      fromPhone,
      'TBS',
      'WA',
      contactName
    );

    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      direction: 'INBOUND',
      sender: 'LEAD',
      sender_user_id: null,
      content: textBody,
      whatsapp_message_id: msgId,
      created_at: new Date().toISOString(),
    });

    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', conversation.id);

    console.log(`[Webhook] conversation=${conversation.id} resolved_mode=${mode} → handing to AI handler`);

    // Always run AI handler — it decides whether to send or just save as suggestion
    waitUntil(
      handleAIResponse(supabase, conversation, textBody).catch((err) => {
        console.error('AI handler error:', err);
      })
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json({ ok: true });
  }
}
