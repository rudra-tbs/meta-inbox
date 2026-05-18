import type { SupabaseClient } from '@supabase/supabase-js';
import type { Brand, Channel } from '@/types';

export interface BrandChannelCreds {
  external_account_id: string;
  access_token: string;
  display_name: string | null;
  source: 'db' | 'env';
}

// Returns the credentials for sending on a given brand+channel. Falls back
// to the legacy env-var setup for TBS+WA so existing deployments keep
// working until they migrate by adding a brand_channels row.
export async function getBrandChannel(
  supabase: SupabaseClient,
  brand: Brand,
  channel: Channel
): Promise<BrandChannelCreds | null> {
  const { data } = await supabase
    .from('brand_channels')
    .select('external_account_id, access_token, display_name')
    .eq('brand', brand)
    .eq('channel', channel)
    .maybeSingle();

  if (data) {
    return {
      external_account_id: data.external_account_id,
      access_token: data.access_token,
      display_name: data.display_name,
      source: 'db',
    };
  }

  if (brand === 'TBS' && channel === 'WA') {
    const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (id && token) {
      return {
        external_account_id: id,
        access_token: token,
        display_name: null,
        source: 'env',
      };
    }
  }

  return null;
}

// Reverse lookup used by the webhook: incoming Meta payload tells us which
// phone_number_id received the message; we map it back to brand+channel.
export async function getBrandFromExternalId(
  supabase: SupabaseClient,
  externalAccountId: string,
  channel: Channel
): Promise<{ brand: Brand; access_token: string } | null> {
  const { data } = await supabase
    .from('brand_channels')
    .select('brand, access_token')
    .eq('external_account_id', externalAccountId)
    .eq('channel', channel)
    .maybeSingle();

  if (data) return { brand: data.brand as Brand, access_token: data.access_token };

  if (channel === 'WA' && externalAccountId === process.env.WHATSAPP_PHONE_NUMBER_ID) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (token) return { brand: 'TBS', access_token: token };
  }

  return null;
}

// Lists configured channels for the brand picker — signup UI uses this to
// decide whether an agent inherits an existing channel or has to connect a new one.
export async function listConfiguredChannels(
  supabase: SupabaseClient
): Promise<Array<{ brand: Brand; channel: Channel; display_name: string | null }>> {
  const { data } = await supabase
    .from('brand_channels')
    .select('brand, channel, display_name');

  const rows = (data ?? []) as Array<{ brand: Brand; channel: Channel; display_name: string | null }>;

  // Surface the legacy TBS+WA env-var configuration as if it were a DB row.
  const hasLegacyTbsWa =
    !!process.env.WHATSAPP_PHONE_NUMBER_ID &&
    !!process.env.WHATSAPP_ACCESS_TOKEN &&
    !rows.some((r) => r.brand === 'TBS' && r.channel === 'WA');
  if (hasLegacyTbsWa) {
    rows.push({ brand: 'TBS', channel: 'WA', display_name: 'WhatsApp (env-configured)' });
  }

  return rows;
}
