export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getUserByAuthId } from '@/lib/auth';
import { tokenEnvKey, getBrandToken } from '@/lib/brand-channels';
import type { Brand, Channel } from '@/types';

// Lightweight check used by the Connect-channel modal so an admin can see
// whether the brand-specific access token env var is already set in this
// deployment BEFORE they fill out the form. Mirrors the token_env_set flag
// returned from GET /api/brand-channels, but for brand+channel pairs that
// haven't been saved yet.
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

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const brand = (url.searchParams.get('brand') ?? '').trim();
  const channel = (url.searchParams.get('channel') ?? '').trim() as Channel;
  if (!brand) return NextResponse.json({ error: 'brand is required' }, { status: 400 });
  if (channel !== 'WA' && channel !== 'IG') {
    return NextResponse.json({ error: 'channel must be WA or IG' }, { status: 400 });
  }

  const envKey = tokenEnvKey(brand as Brand, channel);
  return NextResponse.json({
    brand,
    channel,
    token_env_key: envKey,
    token_env_set: !!getBrandToken(brand as Brand, channel),
  });
}
