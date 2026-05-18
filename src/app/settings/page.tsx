import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserByAuthId } from '@/lib/auth';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
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
  if (!user) redirect('/login');

  const appUser = await getUserByAuthId(user.id);
  if (!appUser) redirect('/login');

  return <SettingsClient currentUser={appUser} />;
}
