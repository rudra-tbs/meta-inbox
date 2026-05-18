export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';

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

export async function PUT(
  request: NextRequest,
  { params }: { params: { brand: string } }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const systemPrompt = typeof body?.system_prompt === 'string' ? body.system_prompt.trim() : '';
  if (!systemPrompt) {
    return NextResponse.json({ error: 'system_prompt cannot be empty' }, { status: 400 });
  }
  if (systemPrompt.length > 20000) {
    return NextResponse.json({ error: 'system_prompt is too long (max 20,000 characters)' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from('brand_contexts')
    .upsert({
      brand: params.brand,
      system_prompt: systemPrompt,
      updated_at: new Date().toISOString(),
      updated_by_user_id: admin.id,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { brand: string } }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createServerClient();
  const { error } = await supabase
    .from('brand_contexts')
    .delete()
    .eq('brand', params.brand);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
