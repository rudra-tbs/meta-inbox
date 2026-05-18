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
  const access = (body?.access ?? []) as Array<{ brand: string; channel: string }>;

  const valid = access.filter(
    (a) => ['TBS', 'RD'].includes(a.brand) && ['WA', 'IG'].includes(a.channel)
  );
  if (valid.length === 0) {
    return NextResponse.json({ error: 'Pick at least one brand and channel' }, { status: 400 });
  }

  const supabase = createServerClient();

  // Replace rather than append so re-running signup doesn't duplicate.
  await supabase.from('user_access').delete().eq('user_id', appUser.id);
  const { error } = await supabase.from('user_access').insert(
    valid.map((a) => ({ user_id: appUser.id, brand: a.brand, channel: a.channel }))
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ count: valid.length });
}
