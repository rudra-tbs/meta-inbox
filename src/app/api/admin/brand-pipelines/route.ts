export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { logAdminEvent } from '@/lib/admin-events';

// Backwards-compatible endpoint paths. Used to manage rows in the
// brand_pipelines table — that table is dropped by 2026_05_brand_is_pipeline_id.sql
// because brand id now IS the CRM pipeline id. The only remaining
// configuration per brand is the initial stage, which lives in
// brand_settings.initial_stage_id. We keep the URL stable so the
// PipelinesTab UI doesn't need a forklift; the response shape also
// preserves the `pipeline_id` field (set to parseInt(brand)) so the
// UI can keep rendering "Pipeline #N · Stage #M".

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

// GET — list initial-stage configuration per brand.
//
// Reads from brand_settings now. Returns the brand id (which IS the CRM
// pipeline id post-migration) as pipeline_id so the UI keeps its shape.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('brand_settings')
    .select('brand, initial_stage_id, updated_at, updated_by:users!updated_by_user_id(name)')
    .not('initial_stage_id', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => ({
    brand: r.brand,
    // pipeline_id is identical to the brand id now — kept for response
    // shape compatibility with the older UI.
    pipeline_id: /^\d+$/.test(r.brand) ? parseInt(r.brand, 10) : null,
    initial_stage_id: r.initial_stage_id,
    updated_at: r.updated_at,
    updated_by_name: r.updated_by?.name ?? null,
  }));

  return NextResponse.json(rows);
}

interface PutBody {
  brand: string;
  // pipeline_id is accepted for backwards compatibility but ignored.
  // The pipeline IS the brand; if a caller passes a different value
  // we reject so the data model stays consistent.
  pipeline_id?: number;
  initial_stage_id: number;
}

// PUT — upsert the initial stage for one brand.
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
  const stageId = Number(body?.initial_stage_id);

  if (!brand) return NextResponse.json({ error: 'Brand is required' }, { status: 400 });
  if (!Number.isInteger(stageId) || stageId <= 0) {
    return NextResponse.json({ error: 'initial_stage_id must be a positive integer' }, { status: 400 });
  }

  // Enforce the new invariant: pipeline_id, if sent, must equal the
  // numeric brand id. Anything else is the UI passing stale state.
  if (body.pipeline_id !== undefined && body.pipeline_id !== null) {
    const numericBrand = /^\d+$/.test(brand) ? parseInt(brand, 10) : null;
    if (numericBrand !== null && Number(body.pipeline_id) !== numericBrand) {
      return NextResponse.json(
        { error: `Brand id and pipeline_id must match (brand=${brand}, pipeline_id=${body.pipeline_id}). The brand IS the CRM pipeline id now — no separate mapping.` },
        { status: 400 }
      );
    }
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from('brand_settings')
    .upsert(
      {
        brand,
        initial_stage_id: stageId,
        updated_by_user_id: admin.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'brand' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminEvent(supabase, admin, 'PIPELINE_MAPPED', 'brand_pipeline', brand, {
    pipeline_id: /^\d+$/.test(brand) ? parseInt(brand, 10) : null,
    initial_stage_id: stageId,
  });

  return NextResponse.json({ ok: true });
}

// DELETE — clear the initial stage for a brand. Push-to-CRM falls back
// to CRM_PIPELINE_<BRAND>_INITIAL_STAGE_ID or CRM_DEFAULT_INITIAL_STAGE_ID.
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const brand = searchParams.get('brand');
  if (!brand) return NextResponse.json({ error: 'brand query param required' }, { status: 400 });

  const supabase = createServerClient();
  const { error } = await supabase
    .from('brand_settings')
    .update({
      initial_stage_id: null,
      updated_by_user_id: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq('brand', brand);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminEvent(supabase, admin, 'PIPELINE_UNMAPPED', 'brand_pipeline', brand, {});

  return NextResponse.json({ ok: true });
}
