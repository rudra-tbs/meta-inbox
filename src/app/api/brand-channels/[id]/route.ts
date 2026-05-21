export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { fetchWhatsAppNumberInfo } from '@/lib/whatsapp';
import { fetchInstagramAccountInfo } from '@/lib/instagram';
import { logAdminEvent } from '@/lib/admin-events';
import { getBrandToken, resolveTokenEnvKey } from '@/lib/brand-channels';
import type { Brand, Channel } from '@/types';

async function requireAdmin() {
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
  if (!user) return null;
  const appUser = await getUserByAuthId(user.id);
  if (!appUser || appUser.role !== 'ADMIN') return null;
  return appUser;
}

// PATCH no longer accepts access_token. Tokens live in env vars
// (WHATSAPP_TOKEN_<SUFFIX> / INSTAGRAM_TOKEN_<SUFFIX>) and rotate by
// editing Vercel env + redeploy. The suffix is computed from the brand's
// display name at onboarding and stored in brand_settings.token_env_suffix.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const newAccount = typeof body?.external_account_id === 'string' ? body.external_account_id.trim() : null;

  if (typeof body?.access_token === 'string' && body.access_token.trim()) {
    return NextResponse.json(
      { error: 'Tokens are no longer stored in the database. Set WHATSAPP_TOKEN_<SUFFIX> or INSTAGRAM_TOKEN_<SUFFIX> in your Vercel environment and redeploy.' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const { data: existing, error: lookupErr } = await supabase
    .from('brand_channels')
    .select('brand, channel, external_account_id')
    .eq('id', params.id)
    .single();
  if (lookupErr || !existing) {
    return NextResponse.json({ error: 'Brand channel not found' }, { status: 404 });
  }

  if (newAccount && newAccount !== existing.external_account_id) {
    const brand = existing.brand as Brand;
    const channel = existing.channel as Channel;
    const token = await getBrandToken(supabase, brand, channel);
    // Re-validate against Meta only when the env token is configured. Without
    // a token we can't verify the credential pair; save the row so the admin
    // can finish wiring the env var in Vercel.
    if (token) {
      if (channel === 'WA') {
        try {
          const info = await fetchWhatsAppNumberInfo(newAccount, token);
          updates.external_account_id = newAccount;
          updates.display_name = info.verified_name
            ? `${info.display_phone_number} (${info.verified_name})`
            : info.display_phone_number;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Meta rejected the credentials';
          return NextResponse.json({ error: `Could not verify with Meta: ${msg}` }, { status: 400 });
        }
      } else if (channel === 'IG') {
        try {
          const info = await fetchInstagramAccountInfo(newAccount, token);
          updates.external_account_id = newAccount;
          updates.display_name = info.display_name;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Meta rejected the credentials';
          return NextResponse.json({ error: `Could not verify with Meta: ${msg}` }, { status: 400 });
        }
      } else {
        updates.external_account_id = newAccount;
      }
    } else {
      updates.external_account_id = newAccount;
      const envKey = await resolveTokenEnvKey(supabase, brand, channel);
      console.warn(`[Brand Channels] ${envKey} not set — saving without Meta validation`);
    }
  }

  if (typeof body?.display_name === 'string' && !('display_name' in updates)) {
    updates.display_name = body.display_name.trim() || null;
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { error } = await supabase.from('brand_channels').update(updates).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminEvent(supabase, admin, 'CHANNEL_UPDATED', 'channel', params.id, {
    brand: existing.brand,
    channel: existing.channel,
    changed: Object.keys(updates).filter((k) => k !== 'updated_at'),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createServerClient();
  const { data: prev } = await supabase
    .from('brand_channels')
    .select('brand, channel, display_name')
    .eq('id', params.id)
    .single();

  const { error } = await supabase.from('brand_channels').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminEvent(supabase, admin, 'CHANNEL_DISCONNECTED', 'channel', params.id, {
    brand: prev?.brand,
    channel: prev?.channel,
    display_name: prev?.display_name,
  });

  return NextResponse.json({ ok: true });
}
