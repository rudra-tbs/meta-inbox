export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getUserByAuthId } from '@/lib/auth';
import { queryCRM } from '@/lib/mysql-crm';

interface CRMUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role_id: number;
}

export async function GET() {
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const appUser = await getUserByAuthId(user.id);
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await queryCRM<CRMUser[]>(
    `SELECT id, first_name, last_name, email, role_id
     FROM users
     WHERE active = 1
       AND id NOT IN (80, 81, 82, 86, 109)
       AND email NOT LIKE '%gmail.com%'
     ORDER BY first_name ASC`
  );

  return NextResponse.json(rows);
}
