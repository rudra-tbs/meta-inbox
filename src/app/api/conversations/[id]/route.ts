export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';

export async function GET(
  _request: NextRequest,
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

  const { data: conversation, error } = await supabase
    .from('conversations')
    .select(`
      *,
      contact:contacts(name, phone, instagram_id, city, wedding_date, guest_count, budget_range, service_type),
      assigned_user:users!assigned_to(name)
    `)
    .eq('id', params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = conversation as any;
  return NextResponse.json({
    ...c,
    contact: undefined,
    assigned_user: undefined,
    assigned_user_name: c.assigned_user?.name ?? null,
    contact_name: c.contact?.name ?? c.contact_name,
    city: c.contact?.city ?? c.city,
    wedding_date: c.contact?.wedding_date ?? c.wedding_date,
    guest_count: c.contact?.guest_count ?? c.guest_count,
    budget_range: c.contact?.budget_range ?? c.budget_range,
    service_type: c.contact?.service_type ?? c.service_type,
    contact_phone: c.contact?.phone ?? null,
    contact_instagram_id: c.contact?.instagram_id ?? null,
  });
}

export async function PATCH(
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
  const allowed = ['callback_required', 'needs_human_reply'] as const;
  type PatchableField = typeof allowed[number];

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of allowed) {
    if (field in body) updates[field] = body[field as PatchableField];
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { error } = await supabase
    .from('conversations')
    .update(updates)
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
