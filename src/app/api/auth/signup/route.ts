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

  const { data: existingUser } = await serviceClient.from('users').select('id').eq('email', email).maybeSingle();
  if (existingUser) {
    return NextResponse.json({ error: 'An account with this email already exists. Sign in instead.' }, { status: 409 });
  }

  // Auto-confirm the auth user. Email verification is intentionally skipped so
  // new agents can complete onboarding in one sitting. If we ever want to put
  // verification back, flip email_confirm to false (or switch to signUp) and
  // restore the "Check your email" screen in SignupClient.
  const { data: created, error: createErr } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (createErr || !created.user) {
    const msg = createErr?.message ?? 'Could not create account';
    // Supabase returns "already registered" if the auth.users row exists even
    // when our public.users row doesn't (i.e. an orphan on the auth side).
    const status = /already/i.test(msg) ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  // Insert the public.users row now so subsequent onboarding requests can find
  // it via auth_id. If this fails we roll back the auth user so the email
  // doesn't get stuck in a half-created state.
  const { error: insertErr } = await serviceClient.from('users').insert({
    auth_id: created.user.id,
    name,
    email,
    role: 'AGENT',
  });

  if (insertErr) {
    await serviceClient.auth.admin.deleteUser(created.user.id).catch(() => {});
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Sign the user in immediately. The SSR cookie adapter writes the session
  // cookies onto the response so the client lands on /signup already
  // authenticated and can call /api/onboarding/* without an extra round-trip.
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

  const { error: signInErr } = await supabaseAnon.auth.signInWithPassword({ email, password });
  if (signInErr) {
    // Account is created but auto-sign-in failed — surface it so the client
    // can fall back to /login instead of looping.
    return NextResponse.json(
      { signedIn: false, error: signInErr.message },
      { status: 201 }
    );
  }

  return NextResponse.json({ signedIn: true, name, email }, { status: 201 });
}
