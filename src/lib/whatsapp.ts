import { createServerClient } from '@/lib/supabase';
import { getBrandChannel, getBrandToken, tokenEnvKey } from '@/lib/brand-channels';
import type { Brand } from '@/types';

interface SendOptions {
  phoneNumberId: string;
  accessToken: string;
}

async function postMessage(to: string, text: string, opts: SendOptions): Promise<string | null> {
  const url = `https://graph.facebook.com/v19.0/${opts.phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    const errCode = err?.error?.code;
    const errMsg = err?.error?.message ?? 'Unknown error';
    if (errCode === 190) {
      console.error(`[WhatsApp] Token expired (code 190) — generate a new token at developers.facebook.com`);
    } else {
      console.error(`[WhatsApp] Send failed (code ${errCode}): ${errMsg}`);
    }
    console.error(`[WhatsApp] Full error:`, JSON.stringify(err));
    throw new Error(`WhatsApp send failed: ${errMsg} (code ${errCode})`);
  }
  const data = await res.json();
  return data?.messages?.[0]?.id ?? null;
}

// Brand-aware send. Looks up the brand's phone_number_id from brand_channels
// and reads the long-lived access token from the environment (env var
// WHATSAPP_TOKEN_<BRAND>). Tokens are intentionally NOT stored in Postgres.
export async function sendWhatsAppMessage(
  brand: Brand,
  to: string,
  text: string
): Promise<string | null> {
  const supabase = createServerClient();
  const creds = await getBrandChannel(supabase, brand, 'WA');
  if (!creds) {
    // Distinguish missing-row from missing-env so the operator knows which to fix.
    const token = getBrandToken(brand, 'WA');
    if (!token) {
      throw new Error(`WhatsApp token not set for brand ${brand} — configure env var ${tokenEnvKey(brand, 'WA')}`);
    }
    throw new Error(`WhatsApp not configured for brand ${brand} — add a brand_channels row from /admin → Channels`);
  }
  return postMessage(to, text, {
    phoneNumberId: creds.external_account_id,
    accessToken: creds.access_token,
  });
}

// Used by the signup flow to validate a freshly-pasted credential pair before
// we store it. Returns the display name (phone number) from Meta on success.
export async function fetchWhatsAppNumberInfo(
  phoneNumberId: string,
  accessToken: string
): Promise<{ display_phone_number: string; verified_name: string | null }> {
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}?fields=display_phone_number,verified_name`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Meta API returned ${res.status}`);
  }
  const data = await res.json();
  return {
    display_phone_number: data.display_phone_number ?? phoneNumberId,
    verified_name: data.verified_name ?? null,
  };
}
