export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase';
import { resolveConversation } from '@/lib/ai-mode';
import { handleAIResponse } from '@/lib/ai-handler';
import { verifyWebhookSignature } from '@/lib/webhook-verify';
import { getBrandFromExternalId } from '@/lib/brand-channels';
import type { Conversation } from '@/types';

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

interface MetaMessage {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
  // Media types we recognise enough to record a placeholder for.
  image?: { caption?: string };
  audio?: { voice?: boolean };
  voice?: unknown;
  video?: { caption?: string };
  document?: { filename?: string; caption?: string };
  sticker?: unknown;
  location?: { latitude?: number; longitude?: number; name?: string };
  interactive?: unknown;
  button?: { text?: string };
  reaction?: { emoji?: string };
}

interface MetaStatus {
  id: string;
  status: string;
  timestamp?: string;
}

// Turn a non-text Meta message into a short placeholder so the RM at least
// sees that something arrived. We can't render media yet, but silently
// dropping voice notes is worse than showing a placeholder.
function placeholderForNonText(msg: MetaMessage): string | null {
  switch (msg.type) {
    case 'image':
      return msg.image?.caption ? `[image] ${msg.image.caption}` : '[image]';
    case 'audio':
    case 'voice':
      return '[voice note]';
    case 'video':
      return msg.video?.caption ? `[video] ${msg.video.caption}` : '[video]';
    case 'document':
      return msg.document?.filename ? `[document: ${msg.document.filename}]` : '[document]';
    case 'sticker':
      return '[sticker]';
    case 'location':
      return msg.location?.name ? `[location: ${msg.location.name}]` : '[location shared]';
    case 'interactive':
      return '[interactive reply]';
    case 'button':
      return msg.button?.text ? `[button] ${msg.button.text}` : '[button reply]';
    case 'reaction':
      return msg.reaction?.emoji ? `[reaction: ${msg.reaction.emoji}]` : '[reaction]';
    case 'contacts':
      return '[contact card]';
    default:
      return `[${msg.type || 'unsupported'} message]`;
  }
}

async function applyStatuses(supabase: SupabaseClient, statuses: MetaStatus[]): Promise<void> {
  for (const s of statuses) {
    const waId = s.id;
    const status = s.status;
    const ts = s.timestamp
      ? new Date(parseInt(s.timestamp) * 1000).toISOString()
      : new Date().toISOString();
    const updates: Record<string, unknown> = {};
    if (status === 'delivered') updates.delivered_at = ts;
    if (status === 'read') {
      updates.read_at = ts;
      updates.delivered_at = ts;
    }
    if (status === 'failed') {
      updates.delivered_status = 'FAILED';
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from('messages').update(updates).eq('whatsapp_message_id', waId);
    }
  }
}

async function handleOneMessage(
  supabase: SupabaseClient,
  msg: MetaMessage,
  contactName: string | null,
  recipientPhoneNumberId: string
): Promise<void> {
  const route = await getBrandFromExternalId(supabase, recipientPhoneNumberId, 'WA');
  if (!route) {
    console.warn(`[Webhook] no brand configured for phone_number_id=${recipientPhoneNumberId}`);
    return;
  }
  const brand = route.brand;
  const fromPhone = msg.from;
  const msgId = msg.id;

  // Dedupe — Meta retries on non-2xx and may also batch-deliver duplicates.
  const { data: existing } = await supabase
    .from('messages')
    .select('id')
    .eq('whatsapp_message_id', msgId)
    .maybeSingle();
  if (existing) return;

  const isText = msg.type === 'text';
  const textBody = isText ? (msg.text?.body ?? '') : null;
  const placeholder = isText ? null : placeholderForNonText(msg);
  const storedContent = isText ? textBody! : (placeholder ?? `[${msg.type} message]`);

  const { conversation, mode } = await resolveConversation(
    supabase,
    fromPhone,
    brand,
    'WA',
    contactName
  );

  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    direction: 'INBOUND',
    sender: 'LEAD',
    sender_user_id: null,
    content: storedContent,
    whatsapp_message_id: msgId,
    delivered_status: 'SENT',
    created_at: new Date().toISOString(),
  });

  // Atomic unread increment + last_message_at/updated_at refresh.
  await supabase.rpc('increment_unread', { conv_id: conversation.id });

  // Auto-unsnooze on inbound: if the lead replied to a snoozed thread, the
  // RM needs to see it now, not when the snooze expires.
  // Also update the cached preview so the inbox list reflects the new message.
  const convUpdates: Record<string, unknown> = {
    last_message_preview: storedContent.slice(0, 500),
  };
  if (conversation.snoozed_until && new Date(conversation.snoozed_until) > new Date()) {
    convUpdates.snoozed_until = null;
  }
  await supabase.from('conversations').update(convUpdates).eq('id', conversation.id);

  console.log(`[Webhook] conversation=${conversation.id} type=${msg.type} resolved_mode=${mode}`);

  // Non-text inbound: flag for human review, don't call the AI.
  if (!isText) {
    await supabase
      .from('conversations')
      .update({ needs_human_reply: true, updated_at: new Date().toISOString() })
      .eq('id', conversation.id);
    return;
  }

  // Always run AI handler — it decides whether to send or save as suggestion.
  waitUntil(
    handleAIResponse(supabase, conversation as Conversation, textBody!).catch((err) => {
      console.error('AI handler error:', err);
    })
  );
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
    const supabase = createServerClient();

    // Iterate ALL entries → changes → messages/statuses. Meta batches; the
    // previous one-entry-one-message reader silently dropped batched payloads.
    const entries = Array.isArray(body?.entry) ? body.entry : [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value;
        if (!value) continue;

        const statuses = Array.isArray(value.statuses) ? (value.statuses as MetaStatus[]) : [];
        if (statuses.length > 0) {
          await applyStatuses(supabase, statuses);
        }

        const messages = Array.isArray(value.messages) ? (value.messages as MetaMessage[]) : [];
        if (messages.length === 0) continue;

        const recipientPhoneNumberId = value?.metadata?.phone_number_id as string | undefined;
        if (!recipientPhoneNumberId) {
          console.warn('[Webhook] payload missing metadata.phone_number_id — cannot route');
          continue;
        }
        const contactName = value?.contacts?.[0]?.profile?.name ?? null;

        for (const msg of messages) {
          try {
            await handleOneMessage(supabase, msg, contactName, recipientPhoneNumberId);
          } catch (err) {
            console.error(`[Webhook] failed to handle message ${msg?.id}:`, err);
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    // Return 200 so Meta doesn't enter a retry storm on a bug. We still log.
    return NextResponse.json({ ok: true });
  }
}
