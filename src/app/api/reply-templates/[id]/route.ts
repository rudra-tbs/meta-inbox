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

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.name === 'string' && body.name.trim()) updates.name = body.name.trim();
  if (typeof body?.content === 'string' && body.content.trim()) updates.content = body.content.trim();
  if (typeof body?.shortcut === 'string') updates.shortcut = body.shortcut.trim() || null;

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: prev } = await supabase
    .from('reply_templates')
    .select('brand, name')
    .eq('id', params.id)
    .single();

  const { error } = await supabase
    .from('reply_templates')
    .update(updates)
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminEvent(supabase, admin, 'TEMPLATE_UPDATED', 'reply_template', params.id, {
    brand: prev?.brand,
    name: prev?.name,
    changed: Object.keys(updates).filter((k) => k !== 'updated_at'),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createServerClient();
  const { data: prev } = await supabase
    .from('reply_templates')
    .select('brand, name')
    .eq('id', params.id)
    .single();

  const { error } = await supabase.from('reply_templates').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminEvent(supabase, admin, 'TEMPLATE_DELETED', 'reply_template', params.id, {
    brand: prev?.brand,
    name: prev?.name,
  });

  return NextResponse.json({ ok: true });
}
