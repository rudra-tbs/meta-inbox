export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { fetchWhatsAppNumberInfo } from '@/lib/whatsapp';
import { fetchInstagramAccountInfo } from '@/lib/instagram';
import { logAdminEvent } from '@/lib/admin-events';
import {
  resolveTokenEnvSuffix,
  tokenEnvKeyForSuffix,
} from '@/lib/brand-channels';
import { brandToEnvKey } from '@/lib/brand-env';
import { queryCRM } from '@/lib/mysql-crm';
import type { Channel } from '@/types';

// Resolves the brand's display name. The UI passes it directly (the
// signup wizard already has it from /api/onboarding/state). If absent
// we try the CRM pipelines table when the brand id looks numeric;
// otherwise we use the id itself as a last resort.
async function resolveDisplayName(brand: string, provided: string | null): Promise<string> {
  if (provided && provided.trim()) return provided.trim();
  if (/^\d+$/.test(brand)) {
    try {
      const rows = await queryCRM<Array<{ name: string }>>(
        'SELECT name FROM pipelines WHERE id = ? LIMIT 1',
        [parseInt(brand)],
      );
      if (rows[0]?.name) return rows[0].name;
    } catch (err) {
      console.warn('[onboarding/channel] could not look up brand name from CRM:', err);
    }
  }
  return brand;
}

// Onboards a brand+channel by adding a brand_channels row pointing at the
// Meta account id (phone_number_id for WA, IG business account id for IG).
// The long-lived access token is NOT accepted here — it lives in
// WHATSAPP_TOKEN_<SUFFIX> / INSTAGRAM_TOKEN_<SUFFIX> env vars, where
// SUFFIX is derived from the brand's display name via brandToEnvKey()
// and persisted to brand_settings.token_env_suffix.
export async function POST(request: NextRequest) {
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

  const appUser = await getUserByAuthId(user.id);
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const brand = String(body?.brand ?? '').trim();
  const channel = body?.channel as Channel;
  const externalAccountId = String(body?.external_account_id ?? '').trim();
  const providedDisplayName = typeof body?.display_name === 'string' ? body.display_name : null;

  if (!brand) {
    return NextResponse.json({ error: 'Brand is required' }, { status: 400 });
  }
  if (!['WA', 'IG'].includes(channel)) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
  }
  if (!externalAccountId) {
    return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
  }

  const supabase = createServerClient();

  // Compute (and persist) the env-var suffix for this brand. If a
  // brand_settings row already has a suffix, we reuse it — don't
  // accidentally overwrite an admin's manual choice from a CRM rename.
  const existingSuffix = await resolveTokenEnvSuffix(supabase, brand);
  const displayName = await resolveDisplayName(brand, providedDisplayName);
  const derivedSuffix = brandToEnvKey(displayName);
  // The resolver falls back to String(brand).toUpperCase() when no row
  // exists — treat that case as "no manual suffix" and prefer the
  // freshly-derived one if it produces something readable.
  const fallbackSuffix = String(brand).toUpperCase();
  const looksManual = !!existingSuffix && existingSuffix !== fallbackSuffix;
  const finalSuffix = looksManual ? existingSuffix : (derivedSuffix || fallbackSuffix);

  if (!finalSuffix) {
    return NextResponse.json(
      { error: 'Could not derive a token env-var suffix from the brand name. Provide display_name in the body.' },
      { status: 400 },
    );
  }

  // Upsert brand_settings.token_env_suffix. This is the source of truth
  // for env-key resolution; getBrandToken() reads it on every send.
  const { error: upsertErr } = await supabase
    .from('brand_settings')
    .upsert(
      {
        brand,
        token_env_suffix: finalSuffix,
        updated_by_user_id: appUser.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'brand' },
    );
  if (upsertErr) {
    console.error('[onboarding/channel] could not persist token_env_suffix:', upsertErr);
    return NextResponse.json(
      { error: `Could not persist brand_settings.token_env_suffix: ${upsertErr.message}` },
      { status: 500 },
    );
  }

  const envKey = tokenEnvKeyForSuffix(channel, finalSuffix);
  const envToken = process.env[envKey] ?? null;
  let displayLabel: string | null = null;
  let validated = false;

  if (envToken) {
    if (channel === 'WA') {
      try {
        const info = await fetchWhatsAppNumberInfo(externalAccountId, envToken);
        displayLabel = info.verified_name
          ? `${info.display_phone_number} (${info.verified_name})`
          : info.display_phone_number;
        validated = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to verify credentials with Meta';
        return NextResponse.json({ error: `Could not verify with Meta: ${msg}` }, { status: 400 });
      }
    } else {
      try {
        const info = await fetchInstagramAccountInfo(externalAccountId, envToken);
        displayLabel = info.display_name;
        validated = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to verify Instagram credentials with Meta';
        return NextResponse.json({ error: `Could not verify with Meta: ${msg}` }, { status: 400 });
      }
    }
  }

  const { data: existing } = await supabase
    .from('brand_channels')
    .select('id')
    .eq('brand', brand)
    .eq('channel', channel)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: `${brand} ${channel} is already connected. Other agents in this brand will inherit it automatically.` },
      { status: 409 }
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from('brand_channels')
    .insert({
      brand,
      channel,
      external_account_id: externalAccountId,
      display_name: displayLabel,
      configured_by_user_id: appUser.id,
    })
    .select('id')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  if (inserted?.id) {
    await logAdminEvent(supabase, appUser, 'CHANNEL_CONNECTED', 'channel', inserted.id, {
      brand,
      channel,
      external_account_id: externalAccountId,
      display_name: displayLabel,
      token_env_key: envKey,
      token_env_suffix: finalSuffix,
      token_env_set: !!envToken,
    });
  }

  return NextResponse.json(
    {
      brand,
      channel,
      display_name: displayLabel,
      token_env_key: envKey,
      token_env_suffix: finalSuffix,
      token_env_set: !!envToken,
      validated,
      warning: !envToken
        ? `Saved without Meta validation. Set ${envKey} in your environment to enable sending.`
        : null,
    },
    { status: 201 }
  );
}
