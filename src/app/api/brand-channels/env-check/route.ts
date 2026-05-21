export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { resolveTokenEnvKey, tokenEnvKeyForSuffix } from '@/lib/brand-channels';
import { brandToEnvKey } from '@/lib/brand-env';
import type { Brand, Channel } from '@/types';

// Used by the Connect-channel modal so an admin can see whether the
// brand-specific access token env var is already set in this deployment
// BEFORE they fill out the form.
//
// Two modes:
//   ?brand=<id>&channel=WA|IG
//     Resolves via brand_settings.token_env_suffix → legacy fallback.
//     Used after onboarding (or for already-saved rows).
//   ?display_name=<name>&channel=WA|IG
//     Computes the suffix client-side-equivalent from the display name
//     via brandToEnvKey(). Used in the connect modal BEFORE save, so the
//     admin sees the exact env var to add for a new brand.
//   ?brand=<id>&display_name=<name>&channel=WA|IG
//     Same as display_name mode (display_name wins so the admin sees
//     what they'd get for a fresh onboarding). The `brand` param is
//     accepted but ignored when display_name is present.
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
  const displayName = (url.searchParams.get('display_name') ?? '').trim();
  const channel = (url.searchParams.get('channel') ?? '').trim() as Channel;

  if (channel !== 'WA' && channel !== 'IG') {
    return NextResponse.json({ error: 'channel must be WA or IG' }, { status: 400 });
  }
  if (!brand && !displayName) {
    return NextResponse.json({ error: 'brand or display_name is required' }, { status: 400 });
  }

  let envKey: string;
  let suffix: string;

  if (displayName) {
    suffix = brandToEnvKey(displayName);
    if (!suffix) {
      return NextResponse.json(
        { error: 'Could not derive a suffix from display_name' },
        { status: 400 },
      );
    }
    envKey = tokenEnvKeyForSuffix(channel, suffix);
  } else {
    const supabase = createServerClient();
    envKey = await resolveTokenEnvKey(supabase, brand as Brand, channel);
    // Suffix = envKey without prefix
    suffix = envKey.replace(/^(WHATSAPP_TOKEN|INSTAGRAM_TOKEN)_/, '');
  }

  return NextResponse.json({
    brand,
    display_name: displayName || null,
    channel,
    token_env_suffix: suffix,
    token_env_key: envKey,
    token_env_set: !!process.env[envKey],
  });
}
