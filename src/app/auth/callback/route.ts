export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';

// Supabase redirects the email-confirmation link here with ?code=...
// We exchange the code for a session, create the users row if needed,
// then send the user on to the rest of onboarding (or the inbox).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const errorDescription = searchParams.get('error_description');

  if (errorDescription) {
    const url = new URL('/login', origin);
    url.searchParams.set('error', errorDescription);
    return NextResponse.redirect(url);
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login', origin));
  }

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

  const { error: exchangeErr } = await supabaseAuth.auth.exchangeCodeForSession(code);
  if (exchangeErr) {
    const url = new URL('/login', origin);
    url.searchParams.set('error', 'verification_failed');
    return NextResponse.redirect(url);
  }

  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', origin));
  }

  const serviceClient = createServerClient();
  const existing = await getUserByAuthId(user.id);

  if (!existing) {
    // Pull the display name we stashed in user_metadata during signUp.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const name = ((user.user_metadata as any)?.name as string | undefined)?.trim() || user.email?.split('@')[0] || 'New user';

    // Bootstrap: the first user signing up becomes ADMIN so they can manage
    // the rest. Subsequent signups default to AGENT.
    const { count: adminCount } = await serviceClient
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'ADMIN');
    const role = (adminCount ?? 0) === 0 ? 'ADMIN' : 'AGENT';

    await serviceClient.from('users').insert({
      auth_id: user.id,
      name,
      email: user.email,
      role,
    });
  }

  // If they've already completed onboarding (have user_access rows), send to inbox.
  // Otherwise drop them into /signup which will resume at the brands step.
  const appUser = existing ?? (await getUserByAuthId(user.id));
  if (appUser) {
    const { count } = await serviceClient
      .from('user_access')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', appUser.id);
    if ((count ?? 0) > 0) {
      return NextResponse.redirect(new URL('/inbox', origin));
    }
  }

  return NextResponse.redirect(new URL('/signup', origin));
}
