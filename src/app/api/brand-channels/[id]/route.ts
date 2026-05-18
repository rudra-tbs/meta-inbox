export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { fetchWhatsAppNumberInfo } from '@/lib/whatsapp';

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
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Re-validate against Meta whenever credentials change for WA.
  const newAccount = typeof body?.external_account_id === 'string' ? body.external_account_id.trim() : null;
  const newToken = typeof body?.access_token === 'string' ? body.access_token.trim() : null;

  const supabase = createServerClient();
  const { data: existing, error: lookupErr } = await supabase
    .from('brand_channels')
    .select('channel, external_account_id, access_token')
    .eq('id', params.id)
    .single();
  if (lookupErr || !existing) {
    return NextResponse.json({ error: 'Brand channel not found' }, { status: 404 });
  }

  if (newAccount || newToken) {
    const accountId = newAccount ?? existing.external_account_id;
    const token = newToken ?? existing.access_token;
    if (existing.channel === 'WA') {
      try {
        const info = await fetchWhatsAppNumberInfo(accountId, token);
        updates.external_account_id = accountId;
        updates.access_token = token;
        updates.display_name = info.verified_name
          ? `${info.display_phone_number} (${info.verified_name})`
          : info.display_phone_number;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Meta rejected the credentials';
        return NextResponse.json({ error: `Could not verify with Meta: ${msg}` }, { status: 400 });
      }
    } else {
      updates.external_account_id = accountId;
      updates.access_token = token;
    }
  }

  if (typeof body?.display_name === 'string' && !('display_name' in updates)) {
    updates.display_name = body.display_name.trim() || null;
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { error } = await supabase.from('brand_channels').update(updates).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createServerClient();
  const { error } = await supabase.from('brand_channels').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
