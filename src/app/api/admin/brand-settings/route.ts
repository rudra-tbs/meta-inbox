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

// GET — list every brand_settings row. Brands without a row default to AI at
// runtime, so the client treats a missing entry as default_mode='AI'.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('brand_settings')
    .select('brand, default_mode, updated_at, updated_by:users!updated_by_user_id(name)');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => ({
    brand: r.brand,
    default_mode: r.default_mode,
    updated_at: r.updated_at,
    updated_by_name: r.updated_by?.name ?? null,
  }));

  return NextResponse.json(rows);
}

interface PutBody {
  brand: string;
  default_mode: 'AI' | 'HUMAN';
}

// PUT — upsert a single brand's default_mode. Only the conversation creation
// path consumes this; existing conversations keep whatever mode they had.
export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: PutBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const brand = String(body?.brand ?? '').trim();
  const defaultMode = body?.default_mode;

  if (!brand) return NextResponse.json({ error: 'Brand is required' }, { status: 400 });
  if (defaultMode !== 'AI' && defaultMode !== 'HUMAN') {
    return NextResponse.json({ error: "default_mode must be 'AI' or 'HUMAN'" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from('brand_settings')
    .upsert(
      {
        brand,
        default_mode: defaultMode,
        updated_by_user_id: admin.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'brand' },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminEvent(supabase, admin, 'BRAND_DEFAULT_MODE_CHANGED', 'brand_setting', brand, {
    default_mode: defaultMode,
  });

  return NextResponse.json({ ok: true });
}
