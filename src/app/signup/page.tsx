import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import SignupClient from './SignupClient';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
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

  // Not signed in → show the full multi-step flow starting at Account.
  if (!user) {
    return <SignupClient />;
  }

  const supabase = createServerClient();
  const appUser = await getUserByAuthId(user.id);

  // Auth user exists but no users row yet — shouldn't happen with the
  // verification flow, but if it does, treat them as fresh.
  if (!appUser) {
    return <SignupClient />;
  }

  // Already fully onboarded → send to inbox.
  const { count } = await supabase
    .from('user_access')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', appUser.id);
  if ((count ?? 0) > 0) {
    redirect('/inbox');
  }

  // Verified + users row exists but no brand access yet — resume mid-flow at Brands.
  return (
    <SignupClient
      verifiedUser={{ id: appUser.id, name: appUser.name, email: appUser.email }}
    />
  );
}
