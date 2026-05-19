export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getUserByAuthId } from '@/lib/auth';
import { queryCRM } from '@/lib/mysql-crm';

interface PipelineRow {
  id: number;
  name: string;
  category: string | null;
  is_deleted: number;
}

interface StageRow {
  id: number;
  pipeline_id: number;
  name: string;
  stage_order: number | null;
  active_flag: number | null;
}

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

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const pipelines = await queryCRM<PipelineRow[]>(
      'SELECT id, name, category, is_deleted FROM pipelines WHERE is_deleted = 0 ORDER BY name'
    );

    const ids = pipelines.map((p) => p.id);
    // Stages live in the `stages` table (legacy code/schema sometimes calls it
    // pipeline_stages — that name doesn't exist in our CRM).
    let stages: StageRow[] = [];
    let stagesError: string | null = null;
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      try {
        stages = await queryCRM<StageRow[]>(
          `SELECT id, pipeline_id, name, stage_order, active_flag
             FROM stages
            WHERE pipeline_id IN (${placeholders})
            ORDER BY pipeline_id, stage_order, id`,
          ids
        );
      } catch (err) {
        stagesError = err instanceof Error ? err.message : 'stages query failed';
        console.warn('[admin/pipelines] stages query failed:', err);
      }
    }

    const stagesByPipeline = new Map<number, StageRow[]>();
    for (const s of stages) {
      // Some test fixtures store active_flag as a bit which serializes as a
      // Buffer; treat anything truthy as active, drop only an explicit 0.
      if (s.active_flag === 0) continue;
      const arr = stagesByPipeline.get(s.pipeline_id) ?? [];
      arr.push(s);
      stagesByPipeline.set(s.pipeline_id, arr);
    }

    return NextResponse.json({
      pipelines: pipelines.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        stages: (stagesByPipeline.get(p.id) ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          sort_order: s.stage_order,
        })),
      })),
      stagesError,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CRM query failed';
    console.error('[admin/pipelines] CRM error:', err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
