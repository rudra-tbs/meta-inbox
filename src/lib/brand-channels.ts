import type { SupabaseClient } from '@supabase/supabase-js';
import type { Brand, Channel } from '@/types';

export interface BrandChannelCreds {
  external_account_id: string;
  access_token: string;
  display_name: string | null;
  source: 'db' | 'env';
}

// Returns the credentials for sending on a given brand+channel. Each brand
// must have a brand_channels row — credentials are no longer inferred from
// env vars for any hardcoded brand.
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

  return (data ?? []) as Array<{ brand: Brand; channel: Channel; display_name: string | null }>;
}
