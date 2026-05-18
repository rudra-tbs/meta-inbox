export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
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

// Returns the admin user list with last_sign_in_at + auth-side metadata that
// the regular /api/users endpoint doesn't expose.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createServerClient();
  const { data: rows, error } = await supabase
    .from('users')
    .select('id, auth_id, name, email, role, active, created_at, user_access(brand, channel)')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pull last_sign_in_at from auth.users via the admin API. We page through 1k
  // at a time which is more than enough for an inbox team.
  const lastSignInByAuthId = new Map<string, string | null>();
  try {
    const { data: page } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of page?.users ?? []) {
      lastSignInByAuthId.set(u.id, u.last_sign_in_at ?? null);
    }
  } catch (err) {
    console.warn('[admin/users] listUsers failed (continuing without last_sign_in_at):', err);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (rows ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    active: r.active ?? true,
    created_at: r.created_at,
    last_sign_in_at: r.auth_id ? lastSignInByAuthId.get(r.auth_id) ?? null : null,
    access: r.user_access ?? [],
  }));

  return NextResponse.json(result);
}
