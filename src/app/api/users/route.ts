export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';

async function getAuthenticatedAdmin() {
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

export async function GET() {
  const appUser = await getAuthenticatedAdmin();
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // All authenticated users can list users (for assign dropdown)
  const supabase = createServerClient();
  const { data: users, error } = await supabase
    .from('users')
    .select('*, user_access(*)')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(users ?? []);
}

export async function POST(request: NextRequest) {
  const appUser = await getAuthenticatedAdmin();
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
