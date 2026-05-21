export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { tokenEnvKey, getBrandToken } from '@/lib/brand-channels';
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

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('brand_channels')
    .select(`
      id,
      brand,
      channel,
      external_account_id,
      display_name,
      configured_at,
      updated_at,
      configured_by:users!configured_by_user_id(name, email)
    `)
    .order('configured_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Tokens now live in env vars keyed by brand. We return the env-var name
  // and whether the corresponding env var is currently set, so the UI can
  // render a "Configured" / "Missing" pill without reading the value itself.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => ({
    id: r.id,
    brand: r.brand,
    channel: r.channel,
    external_account_id: r.external_account_id,
    display_name: r.display_name,
    configured_at: r.configured_at,
    updated_at: r.updated_at,
    configured_by_name: r.configured_by?.name ?? null,
    configured_by_email: r.configured_by?.email ?? null,
    token_env_key: tokenEnvKey(r.brand as Brand, r.channel as Channel),
    token_env_set: !!getBrandToken(r.brand as Brand, r.channel as Channel),
  }));

  return NextResponse.json(rows);
}
