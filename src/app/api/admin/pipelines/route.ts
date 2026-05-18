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
  sort_order: number | null;
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
    let stages: StageRow[] = [];
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      stages = await queryCRM<StageRow[]>(
        `SELECT id, pipeline_id, name, sort_order
           FROM pipeline_stages
          WHERE pipeline_id IN (${placeholders})
          ORDER BY pipeline_id, sort_order, id`,
        ids
      );
    }

    const stagesByPipeline = new Map<number, StageRow[]>();
    for (const s of stages) {
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
          sort_order: s.sort_order,
        })),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CRM query failed';
    console.error('[admin/pipelines] CRM error:', err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
