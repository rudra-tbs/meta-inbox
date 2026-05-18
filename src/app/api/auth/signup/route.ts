export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = String(body?.name ?? '').trim();
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  const supabase = createServerClient();

  // Reject if a users row with this email already exists.
  const { data: existingUser } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  if (existingUser) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message ?? 'Failed to create account' }, { status: 500 });
  }

  const { data: newUser, error: userError } = await supabase
    .from('users')
    .insert({ auth_id: authData.user.id, name, email, role: 'AGENT' })
    .select('*')
    .single();

  if (userError || !newUser) {
    // Roll back the auth user so the email isn't permanently locked out.
    await supabase.auth.admin.deleteUser(authData.user.id).catch(() => {});
    return NextResponse.json({ error: userError?.message ?? 'Failed to save profile' }, { status: 500 });
  }

  // Sign the user in immediately so the rest of the onboarding flow has a session.
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

  const { error: signInError } = await supabaseAuth.auth.signInWithPassword({ email, password });
  if (signInError) {
    return NextResponse.json({ error: 'Account created, but sign-in failed. Try logging in.' }, { status: 500 });
  }

  return NextResponse.json({ id: newUser.id, name: newUser.name, email: newUser.email }, { status: 201 });
}
