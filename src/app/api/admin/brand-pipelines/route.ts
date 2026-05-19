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

// GET — list every brand→pipeline mapping.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('brand_pipelines')
    .select('brand, pipeline_id, initial_stage_id, updated_at, updated_by:users!updated_by_user_id(name)');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => ({
    brand: r.brand,
    pipeline_id: r.pipeline_id,
    initial_stage_id: r.initial_stage_id,
    updated_at: r.updated_at,
    updated_by_name: r.updated_by?.name ?? null,
  }));

  return NextResponse.json(rows);
}

interface PutBody {
  brand: string;
  pipeline_id: number;
  initial_stage_id: number;
}

// PUT — upsert one mapping. We use PUT-style upsert because there's exactly
// one row per brand; admins toggle the values for that brand.
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
  const pipelineId = Number(body?.pipeline_id);
  const stageId = Number(body?.initial_stage_id);

  if (!brand) return NextResponse.json({ error: 'Brand is required' }, { status: 400 });
  if (!Number.isInteger(pipelineId) || pipelineId <= 0) {
    return NextResponse.json({ error: 'pipeline_id must be a positive integer' }, { status: 400 });
  }
  if (!Number.isInteger(stageId) || stageId <= 0) {
    return NextResponse.json({ error: 'initial_stage_id must be a positive integer' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from('brand_pipelines')
    .upsert(
      {
        brand,
        pipeline_id: pipelineId,
        initial_stage_id: stageId,
        updated_by_user_id: admin.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'brand' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE — remove a mapping. Push-to-CRM will then fall back to env vars
// (or the numeric-brand fallback) for this brand.
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const brand = searchParams.get('brand');
  if (!brand) return NextResponse.json({ error: 'brand query param required' }, { status: 400 });

  const supabase = createServerClient();
  const { error } = await supabase.from('brand_pipelines').delete().eq('brand', brand);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
