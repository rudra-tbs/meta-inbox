export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { fetchWhatsAppNumberInfo } from '@/lib/whatsapp';
import type { Channel } from '@/types';

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
  const accessToken = String(body?.access_token ?? '').trim();

  if (!brand) {
    return NextResponse.json({ error: 'Brand is required' }, { status: 400 });
  }
  if (!['WA', 'IG'].includes(channel)) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
  }
  if (!externalAccountId || !accessToken) {
    return NextResponse.json({ error: 'Account ID and access token are required' }, { status: 400 });
  }

  let displayName: string | null = null;

  if (channel === 'WA') {
    try {
      const info = await fetchWhatsAppNumberInfo(externalAccountId, accessToken);
      displayName = info.verified_name
        ? `${info.display_phone_number} (${info.verified_name})`
        : info.display_phone_number;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to verify credentials with Meta';
      return NextResponse.json({ error: `Could not verify with Meta: ${msg}` }, { status: 400 });
    }
  } else {
    // IG validation is out of scope for Phase 1 — record the credentials but
    // mark them with a placeholder display name. Sending IG messages is not
    // yet wired up; storing the credentials means we don't lose them.
    displayName = `Instagram (${externalAccountId})`;
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

  const { error: insertError } = await supabase.from('brand_channels').insert({
    brand,
    channel,
    external_account_id: externalAccountId,
    access_token: accessToken,
    display_name: displayName,
    configured_by_user_id: appUser.id,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ brand, channel, display_name: displayName }, { status: 201 });
}
