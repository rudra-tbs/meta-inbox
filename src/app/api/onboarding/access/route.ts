export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';

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
  const supabase = createServerClient();

  // Two accepted payload shapes:
  //   { brands: ['2', '5'] }            — signup flow: expand to all configured
  //                                       channels for each brand.
  //   { access: [{brand, channel}] }   — /settings → Channels: explicit pairs
  //                                       (some channels of a brand may be
  //                                       opted out).
  // We normalize either input into the explicit-pair shape before insert.
  let pairs: Array<{ brand: string; channel: string }> = [];

  if (Array.isArray(body?.brands)) {
    const brands = (body.brands as unknown[])
      .filter((b): b is string => typeof b === 'string' && b.length > 0);
    if (brands.length > 0) {
      const { data: configured } = await supabase
        .from('brand_channels')
        .select('brand, channel')
        .in('brand', brands);
      pairs = (configured ?? []) as Array<{ brand: string; channel: string }>;
    }
  } else {
    const access = (body?.access ?? []) as Array<{ brand: string; channel: string }>;
    pairs = access.filter(
      (a) => typeof a.brand === 'string' && a.brand.length > 0 && ['WA', 'IG'].includes(a.channel),
    );
  }

  if (pairs.length === 0) {
    return NextResponse.json(
      { error: 'No brand/channel access could be granted — pick at least one brand that has a configured channel.' },
      { status: 400 },
    );
  }

  // Replace rather than append so re-running signup doesn't duplicate.
  await supabase.from('user_access').delete().eq('user_id', appUser.id);
  const { error } = await supabase.from('user_access').insert(
    pairs.map((p) => ({ user_id: appUser.id, brand: p.brand, channel: p.channel })),
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ count: pairs.length });
}
