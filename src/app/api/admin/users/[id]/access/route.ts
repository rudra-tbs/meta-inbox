export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';

async function requireAdmin() {
  const cookieStore = cookies();
  const supabase = createSupabaseSSR(
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const appUser = await getUserByAuthId(user.id);
  if (!appUser || appUser.role !== 'ADMIN') return null;
  return appUser;
}

// Replace the entire access list for a user atomically. Each entry is a
// {brand, channel} pair (e.g. { brand: '67', channel: 'WA' }).
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const access: Array<{ brand: string; channel: string }> = body?.access ?? [];

  if (!Array.isArray(access)) {
    return NextResponse.json({ error: 'access must be an array' }, { status: 400 });
  }
  for (const a of access) {
    if (!a || typeof a.brand !== 'string' || typeof a.channel !== 'string' || !a.brand || !a.channel) {
      return NextResponse.json({ error: 'Each access entry needs brand and channel' }, { status: 400 });
    }
  }

  const supabase = createServerClient();
  const dedup = Array.from(
    new Map(access.map((a) => [`${a.brand}|${a.channel}`, a])).values()
  );

  const { error: delErr } = await supabase
    .from('user_access')
    .delete()
    .eq('user_id', params.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (dedup.length > 0) {
    const { error: insErr } = await supabase
      .from('user_access')
      .insert(dedup.map((a) => ({ user_id: params.id, brand: a.brand, channel: a.channel })));
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: dedup.length });
}
