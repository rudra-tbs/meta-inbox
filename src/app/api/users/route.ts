export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';

async function getAuthenticatedUser() {
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
  if (!appUser) return null;

  return appUser;
}

export async function GET(request: NextRequest) {
  const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);
  const assignable = searchParams.get('assignable') === 'true';
  const brand = searchParams.get('brand');
  const channel = searchParams.get('channel');

  // Admins always get the full user list with PII (for the Users settings tab).
  // Non-admins only ever get the "assignable" view: users with overlapping
  // access to the brand+channel they're working in, and only id/name/role.
  if (appUser.role !== 'ADMIN') {
    if (!assignable || !brand || !channel) {
      // Refuse general user-list requests from non-admins — prevents agents
      // from enumerating staff PII via /api/users.
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { data: accessRows } = await supabase
      .from('user_access')
      .select('user_id')
      .eq('brand', brand)
      .eq('channel', channel);
    const userIds = (accessRows ?? []).map((r) => r.user_id);

    const { data: admins } = await supabase
      .from('users')
      .select('id, name, role')
      .eq('role', 'ADMIN');

    const { data: agents } = userIds.length
      ? await supabase
          .from('users')
          .select('id, name, role')
          .in('id', userIds)
      : { data: [] };

    const merged = [...(admins ?? []), ...(agents ?? [])];
    const dedup = Array.from(new Map(merged.map((u) => [u.id, u])).values());
    dedup.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(dedup);
  }

  // Admin path — full PII view for the settings page.
  if (assignable && brand && channel) {
    // Even an admin may want the filtered list (the assign dropdown uses this).
    const { data: accessRows } = await supabase
      .from('user_access')
      .select('user_id')
      .eq('brand', brand)
      .eq('channel', channel);
    const userIds = (accessRows ?? []).map((r) => r.user_id);
    const { data: admins } = await supabase
      .from('users')
      .select('id, name, role')
      .eq('role', 'ADMIN');
    const { data: agents } = userIds.length
      ? await supabase
          .from('users')
          .select('id, name, role')
          .in('id', userIds)
      : { data: [] };
    const merged = [...(admins ?? []), ...(agents ?? [])];
    const dedup = Array.from(new Map(merged.map((u) => [u.id, u])).values());
    dedup.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(dedup);
  }

  const { data: users, error } = await supabase
    .from('users')
    .select('*, user_access(*)')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(users ?? []);
}

export async function POST(request: NextRequest) {
  const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only admins can create users
  if (appUser.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServerClient();
  const body = await request.json();
  const { name, email, password, role, access } = body as {
    name: string;
    email: string;
    password: string;
    role: 'ADMIN' | 'AGENT';
    access: Array<{ brand: string; channel: string }>;
  };

  // Create Supabase Auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message ?? 'Failed to create auth user' }, { status: 500 });
  }

  // Create users row
  const { data: newUser, error: userError } = await supabase
    .from('users')
    .insert({ auth_id: authData.user.id, name, email, role })
    .select('*')
    .single();

  if (userError || !newUser) {
    return NextResponse.json({ error: userError?.message ?? 'Failed to create user' }, { status: 500 });
  }

  // Create user_access rows
  if (access && access.length > 0) {
    await supabase.from('user_access').insert(
      access.map((a) => ({ user_id: newUser.id, brand: a.brand, channel: a.channel }))
    );
  }

  return NextResponse.json(newUser, { status: 201 });
}
