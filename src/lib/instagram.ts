import { createServerClient } from '@/lib/supabase';
import { getBrandChannel } from '@/lib/brand-channels';
import type { Brand } from '@/types';

interface SendOptions {
  igBusinessAccountId: string;
  accessToken: string;
}

// Posts a text message to an IG-scoped user via the Instagram Messaging API.
// The endpoint shape mirrors WhatsApp's: same graph.facebook.com base, but
// the body uses Messenger-style { recipient, message } instead of the
// WhatsApp { messaging_product, to, type, text } shape.
async function postMessage(
  recipientIgScopedId: string,
  text: string,
  opts: SendOptions,
): Promise<string | null> {
  const url = `https://graph.facebook.com/v19.0/${opts.igBusinessAccountId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { id: recipientIgScopedId },
      message: { text },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errCode = err?.error?.code;
    const errMsg = err?.error?.message ?? `Meta API returned ${res.status}`;
    if (errCode === 190) {
      console.error('[Instagram] Token expired (code 190) — generate a new token at developers.facebook.com');
    } else {
      console.error(`[Instagram] Send failed (code ${errCode}): ${errMsg}`);
    }
    console.error('[Instagram] Full error:', JSON.stringify(err));
    throw new Error(`Instagram send failed: ${errMsg} (code ${errCode})`);
  }
  const data = await res.json();
  // Instagram returns { message_id, recipient_id } — return message_id so we
  // can store it for status receipts + dedupe.
  return data?.message_id ?? null;
}

// Brand-aware IG send. brand_channels stores the IG Business Account ID in
// external_account_id and the long-lived token in access_token. Same lookup
// path as WhatsApp, different channel column.
export async function sendInstagramMessage(
  brand: Brand,
  recipientIgScopedId: string,
  text: string,
): Promise<string | null> {
  const supabase = createServerClient();
  const creds = await getBrandChannel(supabase, brand, 'IG');
  if (!creds) {
    throw new Error(`Instagram not configured for brand ${brand}`);
  }
  return postMessage(recipientIgScopedId, text, {
    igBusinessAccountId: creds.external_account_id,
    accessToken: creds.access_token,
  });
}

// Validates a freshly-pasted IG credential pair before we store it.
// Returns a display label admins will recognise in the Channels tab.
export async function fetchInstagramAccountInfo(
  igAccountId: string,
  accessToken: string,
): Promise<{ username: string | null; display_name: string }> {
  const url = `https://graph.facebook.com/v19.0/${igAccountId}?fields=username,name`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Meta API returned ${res.status}`);
  }
  const data = await res.json();
  const username = (data?.username as string | undefined) ?? null;
  const name = (data?.name as string | undefined) ?? null;
  return {
    username,
    display_name: username ? `@${username}${name ? ` (${name})` : ''}` : (name ?? `Instagram (${igAccountId})`),
  };
}
