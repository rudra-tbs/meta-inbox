export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

  const supabase = createServerClient();
  const appUser = await getUserByAuthId(user.id);
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { userId } = body as { userId: string | null };

  // Access control: agents can only self-assign or unassign themselves
  if (appUser.role === 'AGENT') {
    if (userId !== null && userId !== appUser.id) {
      return NextResponse.json({ error: 'Agents can only self-assign' }, { status: 403 });
    }
  }

  const now = new Date().toISOString();

  // Get assigned user name for response
  let assignedUserName: string | null = null;
  if (userId) {
    const { data: assignedUser } = await supabase
      .from('users')
      .select('name')
      .eq('id', userId)
      .single();
    assignedUserName = assignedUser?.name ?? null;
  }

  const { data: updated, error } = await supabase
    .from('conversations')
    .update({ assigned_to: userId, updated_at: now })
    .eq('id', params.id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ...updated,
    assigned_user_name: assignedUserName,
  });
}
