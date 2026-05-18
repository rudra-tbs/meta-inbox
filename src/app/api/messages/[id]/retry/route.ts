export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

export async function POST(
  _request: NextRequest,
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

  const { data: message, error: msgErr } = await supabase
    .from('messages')
    .select('*, conversation:conversations!conversation_id(id, brand, phone_number)')
    .eq('id', params.id)
    .single();

  if (msgErr || !message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  if (message.direction !== 'OUTBOUND') {
    return NextResponse.json({ error: 'Only outbound messages can be retried' }, { status: 400 });
  }

  if (message.delivered_status !== 'FAILED' && message.delivered_status !== 'PENDING') {
    return NextResponse.json({ error: 'Message is not in a retryable state' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conv = (message as any).conversation;
  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Mark as PENDING again while we attempt
  await supabase
    .from('messages')
    .update({ delivered_status: 'PENDING', send_error: null })
    .eq('id', params.id);

  let waId: string | null = null;
  let sendError: string | null = null;
  try {
    waId = await sendWhatsAppMessage(conv.brand, conv.phone_number, message.content);
  } catch (err) {
    sendError = err instanceof Error ? err.message : String(err);
    console.error('[Retry] WhatsApp send failed:', err);
  }

  if (sendError) {
    await supabase
      .from('messages')
      .update({ delivered_status: 'FAILED', send_error: sendError })
      .eq('id', params.id);
    return NextResponse.json({ error: 'Retry failed', details: sendError }, { status: 502 });
  }

  await supabase
    .from('messages')
    .update({ whatsapp_message_id: waId, delivered_status: 'SENT', send_error: null })
    .eq('id', params.id);

  return NextResponse.json({ ok: true });
}
