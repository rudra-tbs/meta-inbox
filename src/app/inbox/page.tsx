import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getUserByAuthId } from '@/lib/auth';
import InboxClient from './InboxClient';

export default async function InboxPage() {
  const cookieStore = cookies();

  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Session refresh is handled by middleware — no-op in Server Components
        },
      },
    }
  );

  const { data: { user } } = await supabaseAuth.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const appUser = await getUserByAuthId(user.id);

  if (!appUser) {
    redirect('/login');
  }

  return <InboxClient currentUser={appUser} />;
}
