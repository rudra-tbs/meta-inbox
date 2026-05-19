export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { logAdminEvent } from '@/lib/admin-events';

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

// Toggle a user's active flag. Deactivating signs them out of Supabase Auth
// so an open inbox tab won't keep working until the next page load.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const active = body?.active;
  if (typeof active !== 'boolean') {
    return NextResponse.json({ error: 'active must be boolean' }, { status: 400 });
  }

  if (params.id === admin.id && !active) {
    return NextResponse.json({ error: 'You cannot deactivate your own account.' }, { status: 400 });
  }

  const supabase = createServerClient();

  if (!active) {
    const { data: target } = await supabase
      .from('users')
      .select('role')
      .eq('id', params.id)
      .single();
    if (target?.role === 'ADMIN') {
      const { count } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'ADMIN')
        .eq('active', true);
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: 'Cannot deactivate the last active admin.' },
          { status: 400 }
        );
      }
    }
  }

  const { data: target } = await supabase
    .from('users')
    .select('name, email')
    .eq('id', params.id)
    .single();

  const { error } = await supabase
    .from('users')
    .update({ active })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminEvent(
    supabase,
    admin,
    active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
    'user',
    params.id,
    { target_name: target?.name, target_email: target?.email },
  );

  return NextResponse.json({ ok: true });
}
