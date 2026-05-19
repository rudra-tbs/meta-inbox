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
    .select('brand, default_mode, color, logo_url, updated_at, updated_by:users!updated_by_user_id(name)');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => ({
    brand: r.brand,
    default_mode: r.default_mode,
    color: r.color,
    logo_url: r.logo_url,
    updated_at: r.updated_at,
    updated_by_name: r.updated_by?.name ?? null,
  }));

  return NextResponse.json(rows);
}

interface PutBody {
  brand: string;
  default_mode?: 'AI' | 'HUMAN';
  color?: string | null;
  logo_url?: string | null;
}

// Validates a CSS-friendly color value. Accepts hex (#abc / #aabbcc /
// #aabbccdd) and common name keywords. Anything else gets rejected so a typo
// doesn't break the BrandRail rendering.
function isValidColor(v: string): boolean {
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return true;
  return /^[a-z]{3,30}$/i.test(v);
}

// PUT — partial upsert. Fields not present in the body are left untouched.
// Use {brand, default_mode} for the mode toggle, {brand, color, logo_url}
// for the visual identity controls, or both at once.
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
  if (!brand) return NextResponse.json({ error: 'Brand is required' }, { status: 400 });

  const updates: Record<string, unknown> = {
    updated_by_user_id: admin.id,
    updated_at: new Date().toISOString(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logMeta: Record<string, any> = {};

  if (body.default_mode !== undefined) {
    if (body.default_mode !== 'AI' && body.default_mode !== 'HUMAN') {
      return NextResponse.json({ error: "default_mode must be 'AI' or 'HUMAN'" }, { status: 400 });
    }
    updates.default_mode = body.default_mode;
    logMeta.default_mode = body.default_mode;
  }

  if (body.color !== undefined) {
    if (body.color === null || body.color === '') {
      updates.color = null;
    } else if (typeof body.color === 'string' && isValidColor(body.color.trim())) {
      updates.color = body.color.trim();
    } else {
      return NextResponse.json(
        { error: 'color must be a hex value (e.g. #aabbcc) or a CSS color name' },
        { status: 400 },
      );
    }
    logMeta.color = updates.color;
  }

  if (body.logo_url !== undefined) {
    if (body.logo_url === null || body.logo_url === '') {
      updates.logo_url = null;
    } else if (typeof body.logo_url === 'string') {
      const trimmed = body.logo_url.trim();
      if (!/^https?:\/\//i.test(trimmed)) {
        return NextResponse.json({ error: 'logo_url must be an http(s) URL' }, { status: 400 });
      }
      updates.logo_url = trimmed;
    } else {
      return NextResponse.json({ error: 'logo_url must be a string or null' }, { status: 400 });
    }
    logMeta.logo_url = updates.logo_url;
  }

  // Need at least one mutable field. The trailing updated_at/updated_by_user_id
  // don't count.
  if (Object.keys(updates).length <= 2) {
    return NextResponse.json({ error: 'No settings to update' }, { status: 400 });
  }

  const supabase = createServerClient();

  // default_mode is NOT NULL with a default of 'AI'. When upsert is creating a
  // fresh row (the admin set color but never set default_mode), omit
  // default_mode from the upsert so the column default takes over.
  const upsertRow: Record<string, unknown> = { brand, ...updates };
  if (upsertRow.default_mode === undefined) delete upsertRow.default_mode;

  const { error } = await supabase
    .from('brand_settings')
    .upsert(upsertRow, { onConflict: 'brand' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Reuse the existing event type when only default_mode changed; otherwise
  // emit a broader visual-settings event so the audit log stays readable.
  const eventType = Object.keys(updates).every((k) => k === 'default_mode' || k === 'updated_at' || k === 'updated_by_user_id')
    ? 'BRAND_DEFAULT_MODE_CHANGED'
    : 'BRAND_CONTEXT_UPDATED';

  await logAdminEvent(supabase, admin, eventType, 'brand_setting', brand, logMeta);

  return NextResponse.json({ ok: true });
}
