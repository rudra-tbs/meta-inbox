import type { SupabaseClient } from '@supabase/supabase-js';
import type { Brand, Channel } from '@/types';

export interface BrandChannelCreds {
  external_account_id: string;
  access_token: string;
  display_name: string | null;
  source: 'env';
}

// Pure: composes the env-var key from a precomputed suffix + channel.
// Use this when the suffix is already known (e.g. UI preview with the
// brand's display name, or after a brand_settings lookup).
export function tokenEnvKeyForSuffix(channel: Channel, suffix: string): string {
  const prefix = channel === 'IG' ? 'INSTAGRAM_TOKEN' : 'WHATSAPP_TOKEN';
  return `${prefix}_${suffix.toUpperCase()}`;
}

// Looks up the env-var suffix for a brand id from brand_settings. Falls
// back to String(brand).toUpperCase() for legacy rows where
// token_env_suffix has not been populated yet — this keeps deployments
// with brand='TBS' / brand='RD' literals working without a backfill.
export async function resolveTokenEnvSuffix(
  supabase: SupabaseClient,
  brand: Brand,
): Promise<string> {
  const { data } = await supabase
    .from('brand_settings')
    .select('token_env_suffix')
    .eq('brand', String(brand))
    .maybeSingle();
  const suffix = (data?.token_env_suffix as string | undefined)?.trim();
  if (suffix) return suffix;
  return String(brand).toUpperCase();
}

// Async: resolves the full env-var key for a brand+channel via
// brand_settings + legacy fallback.
export async function resolveTokenEnvKey(
  supabase: SupabaseClient,
  brand: Brand,
  channel: Channel,
): Promise<string> {
  const suffix = await resolveTokenEnvSuffix(supabase, brand);
  return tokenEnvKeyForSuffix(channel, suffix);
}

// Reads the long-lived Meta token from the environment. Tokens never live
// in Postgres — they're set in Vercel env (or .env.local) keyed by the
// suffix resolved from brand_settings.token_env_suffix. Returns null when
// the env var is missing, so callers can distinguish "configured" from
// "token broken".
export async function getBrandToken(
  supabase: SupabaseClient,
  brand: Brand,
  channel: Channel,
): Promise<string | null> {
  const key = await resolveTokenEnvKey(supabase, brand, channel);
  return process.env[key] ?? null;
}

// Returns the credentials for sending on a given brand+channel. The
// external_account_id and display_name come from the brand_channels row
// (admin-editable); the access_token comes from the environment, keyed
// via brand_settings.token_env_suffix. Returns null if either piece is
// missing.
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

  const access_token = await getBrandToken(supabase, brand, channel);
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
