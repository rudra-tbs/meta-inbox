export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';

const DEFAULT_ALLOWED_DOMAINS = 'acceltancy.in,thebrideside.in';

function getAllowedDomains(): string[] {
  return (process.env.ALLOWED_SIGNUP_DOMAINS ?? DEFAULT_ALLOWED_DOMAINS)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = String(body?.name ?? '').trim();
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  const allowed = getAllowedDomains();
  const domain = emailDomain(email);
  if (!allowed.includes(domain)) {
    const niceList = allowed.map((d) => `@${d}`).join(' or ');
    return NextResponse.json(
      { error: `Signup is restricted to ${niceList} email addresses.` },
      { status: 403 }
    );
  }

  const serviceClient = createServerClient();

  // Reject if a users row OR an auth user with this email already exists.
  const { data: existingUser } = await serviceClient.from('users').select('id').eq('email', email).maybeSingle();
  if (existingUser) {
    return NextResponse.json({ error: 'An account with this email already exists. Sign in instead.' }, { status: 409 });
  }

  // Use the anon client's signUp so Supabase sends the confirmation email automatically.
  // The user is NOT signed in until they click the email link → /auth/callback exchanges
  // the code for a session and creates the users row.
  const cookieStore = cookies();
  const supabaseAnon = createSupabaseSSR(
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

  const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? '';
  const redirectTo = `${origin}/auth/callback`;

  const { data: signUpData, error: signUpError } = await supabaseAnon.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: { name },
    },
  });

  if (signUpError) {
    // Supabase returns the same error message ("User already registered") for both new and
    // existing-unconfirmed cases. Surface a useful prompt either way.
    const msg = signUpError.message ?? 'Could not create account';
    const status = /already/i.test(msg) ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  if (!signUpData.user) {
    return NextResponse.json({ error: 'Signup did not return a user' }, { status: 500 });
  }

  return NextResponse.json({
    awaitingVerification: true,
    email,
  }, { status: 201 });
}
