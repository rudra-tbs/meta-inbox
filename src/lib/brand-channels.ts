import type { SupabaseClient } from '@supabase/supabase-js';
import type { Brand, Channel } from '@/types';

export interface BrandChannelCreds {
  external_account_id: string;
  access_token: string;
  display_name: string | null;
  source: 'env';
}

// Brand+channel → env var name holding the long-lived Meta token. We
// uppercase the brand so `tbs` and `TBS` both resolve to WHATSAPP_TOKEN_TBS.
// Pattern is documented in CLAUDE.md and .env.example.
export function tokenEnvKey(brand: Brand, channel: Channel): string {
  const prefix = channel === 'IG' ? 'INSTAGRAM_TOKEN' : 'WHATSAPP_TOKEN';
  return `${prefix}_${String(brand).toUpperCase()}`;
}

// Read the long-lived Meta token from the environment. Tokens never live
// in Postgres anymore — they're set in Vercel env (or .env.local) keyed
// by brand. Returns null when the env var is missing, so callers can
// distinguish "configured" from "token broken".
export function getBrandToken(brand: Brand, channel: Channel): string | null {
  return process.env[tokenEnvKey(brand, channel)] ?? null;
}

// Returns the credentials for sending on a given brand+channel. The
// external_account_id and display_name come from the brand_channels row
// (admin-editable); the access_token comes from the environment. Returns
// null if either piece is missing.
export async function getBrandChannel(
  supabase: SupabaseClient,
  brand: Brand,
  channel: Channel
): Promise<BrandChannelCreds | null> {
  const { data } = await supabase
    .from('brand_channels')
    .select('external_account_id, display_name')
    .eq('brand', brand)
    .eq('channel', channel)
    .maybeSingle();

  if (!data) return null;

  const access_token = getBrandToken(brand, channel);
  if (!access_token) return null;

  return {
    external_account_id: data.external_account_id,
    access_token,
    display_name: data.display_name,
    source: 'env',
  };
}

// Reverse lookup used by the webhook: incoming Meta payload tells us which
// phone_number_id / ig_account_id received the message; we map it back to
// brand+channel. Tokens come from env on outbound, so we just return brand.
export async function getBrandFromExternalId(
  supabase: SupabaseClient,
  externalAccountId: string,
  channel: Channel
): Promise<{ brand: Brand } | null> {
  const { data } = await supabase
    .from('brand_channels')
    .select('brand')
    .eq('external_account_id', externalAccountId)
    .eq('channel', channel)
    .maybeSingle();

  if (data) return { brand: data.brand as Brand };
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
