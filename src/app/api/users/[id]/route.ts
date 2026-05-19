export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { logAdminEvent } from '@/lib/admin-events';

async function requireAdmin() {
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
  if (!user) return null;
  const appUser = await getUserByAuthId(user.id);
  if (!appUser || appUser.role !== 'ADMIN') return null;
  return appUser;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (typeof body?.name === 'string' && body.name.trim()) updates.name = body.name.trim();
  if (body?.role === 'ADMIN' || body?.role === 'AGENT') updates.role = body.role;

  // Don't let admins demote themselves into a state where there are zero admins.
  if (body?.role === 'AGENT' && params.id === admin.id) {
    const supabase = createServerClient();
    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'ADMIN');
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'You are the only admin — promote someone else before demoting yourself.' },
        { status: 400 }
      );
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const supabase = createServerClient();
  // Capture the prior values so the audit log can show before→after.
  const { data: prev } = await supabase
    .from('users')
    .select('name, email, role')
    .eq('id', params.id)
    .single();
  const { error } = await supabase.from('users').update(updates).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if ('role' in updates && prev && prev.role !== updates.role) {
    await logAdminEvent(supabase, admin, 'ROLE_CHANGED', 'user', params.id, {
      target_email: prev.email,
      from: prev.role,
      to: updates.role,
    });
  }

  return NextResponse.json({ ok: true });
}

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
  const { data: target } = await supabase
    .from('users')
    .select('auth_id, role, name, email')
    .eq('id', params.id)
    .single();

  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (target.role === 'ADMIN') {
    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'ADMIN');
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Cannot delete the last admin.' },
        { status: 400 }
      );
    }
  }

  // user_access cascades on delete (FK constraint). Then remove Supabase Auth user.
  const { error: delErr } = await supabase.from('users').delete().eq('id', params.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (target.auth_id) {
    await supabase.auth.admin.deleteUser(target.auth_id).catch((err) => {
      console.warn(`[users/${params.id}] auth user delete failed:`, err);
    });
  }

  await logAdminEvent(supabase, admin, 'USER_DELETED', 'user', params.id, {
    target_name: target.name,
    target_email: target.email,
    target_role: target.role,
  });

  return NextResponse.json({ ok: true });
}
