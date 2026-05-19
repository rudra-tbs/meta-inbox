export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { logAdminEvent } from '@/lib/admin-events';

async function requireAdmin() {
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
  if (!user) return null;
  const appUser = await getUserByAuthId(user.id);
  if (!appUser || appUser.role !== 'ADMIN') return null;
  return appUser;
}

// Hard-delete a user. Removes both the Supabase Auth row and the public.users
// row, so the email is freed up for re-invite. user_access cascades; messages
// and conversations keep the user_id columns null-set via existing FKs.
//
// Orphan-tolerant: if the auth.users row is already gone (admin deleted via
// Supabase dashboard), we skip the auth delete and still clear public.users.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (params.id === admin.id) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: target, error: lookupErr } = await supabase
    .from('users')
    .select('id, auth_id, name, email, role, active')
    .eq('id', params.id)
    .maybeSingle();

  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Refuse to remove the last active admin so an admin can't lock everyone out.
  if (target.role === 'ADMIN' && target.active) {
    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'ADMIN')
      .eq('active', true);
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Cannot delete the last active admin.' },
        { status: 400 }
      );
    }
  }

  // Try to delete the auth user. Treat "user not found" as success — it's the
  // orphan case (the auth row was already removed via the Supabase dashboard).
  let authDeleted: 'ok' | 'already_gone' = 'already_gone';
  if (target.auth_id) {
    const { error: authErr } = await supabase.auth.admin.deleteUser(target.auth_id);
    if (authErr) {
      const notFound = /not found|user.*does.*not.*exist/i.test(authErr.message ?? '');
      if (!notFound) {
        return NextResponse.json(
          { error: `Could not delete auth user: ${authErr.message}` },
          { status: 500 }
        );
      }
    } else {
      authDeleted = 'ok';
    }
  }

  const { error: delErr } = await supabase.from('users').delete().eq('id', params.id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  await logAdminEvent(supabase, admin, 'USER_DELETED', 'user', params.id, {
    target_name: target.name,
    target_email: target.email,
    target_role: target.role,
    auth_deletion: authDeleted,
  });

  return NextResponse.json({ ok: true, auth_deletion: authDeleted });
}
