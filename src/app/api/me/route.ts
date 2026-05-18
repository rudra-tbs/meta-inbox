export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';

async function getSessionUser() {
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
  return { authUser: user, appUser };
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServerClient();
  const { data: access } = await supabase
    .from('user_access')
    .select('brand, channel')
    .eq('user_id', session.appUser.id);

  return NextResponse.json({
    id: session.appUser.id,
    name: session.appUser.name,
    email: session.appUser.email,
    role: session.appUser.role,
    created_at: session.appUser.created_at,
    access: access ?? [],
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const name = typeof body?.name === 'string' ? body.name.trim() : null;
  const newPassword = typeof body?.password === 'string' ? body.password : null;

  const supabase = createServerClient();

  if (name !== null) {
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    const { error } = await supabase.from('users').update({ name }).eq('id', session.appUser.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (newPassword !== null) {
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    const { error } = await supabase.auth.admin.updateUserById(session.authUser.id, {
      password: newPassword,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
