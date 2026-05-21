export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { fetchWhatsAppNumberInfo } from '@/lib/whatsapp';
import { fetchInstagramAccountInfo } from '@/lib/instagram';
import { logAdminEvent } from '@/lib/admin-events';
import { getBrandToken, tokenEnvKey } from '@/lib/brand-channels';
import type { Channel } from '@/types';

// Onboards a brand+channel by adding a brand_channels row pointing at the
// Meta account id (phone_number_id for WA, IG business account id for IG).
// The long-lived access token is NOT accepted here — it lives in
// WHATSAPP_TOKEN_<BRAND> / INSTAGRAM_TOKEN_<BRAND> env vars. If that env
// var is set when this route is called we validate the credential pair
// against Meta before inserting; otherwise we save the row and warn so
// the admin can finish wiring the env var in Vercel.
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

  if (!brand) {
    return NextResponse.json({ error: 'Brand is required' }, { status: 400 });
  }
  if (!['WA', 'IG'].includes(channel)) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
  }
  if (!externalAccountId) {
    return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
  }

  const envToken = getBrandToken(brand, channel);
  let displayName: string | null = null;
  let validated = false;

  if (envToken) {
    if (channel === 'WA') {
      try {
        const info = await fetchWhatsAppNumberInfo(externalAccountId, envToken);
        displayName = info.verified_name
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
        displayName = info.display_name;
        validated = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to verify Instagram credentials with Meta';
        return NextResponse.json({ error: `Could not verify with Meta: ${msg}` }, { status: 400 });
      }
    }
  }

  const supabase = createServerClient();

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
      display_name: displayName,
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
      display_name: displayName,
      token_env_key: tokenEnvKey(brand, channel),
      token_env_set: !!envToken,
    });
  }

  return NextResponse.json(
    {
      brand,
      channel,
      display_name: displayName,
      token_env_key: tokenEnvKey(brand, channel),
      token_env_set: !!envToken,
      validated,
      warning: !envToken
        ? `Saved without Meta validation. Set ${tokenEnvKey(brand, channel)} in your environment to enable sending.`
        : null,
    },
    { status: 201 }
  );
}
