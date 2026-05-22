export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { queryCRM } from '@/lib/mysql-crm';

// GET /api/conversations/[id]/push-preview
//
// Returns the pipeline + initial stage names that a push-to-CRM for
// this conversation would land in, so the PushToCRMModal can render
// an "About to create" preview before the operator submits.
//
// Same resolution order as push-to-crm itself:
//   1. brand_settings.initial_stage_id (preferred) for stage
//   2. CRM_PIPELINE_<BRAND>_(ID|INITIAL_STAGE_ID) env vars
//   3. parseInt(brand) for pipeline id, CRM_DEFAULT_INITIAL_STAGE_ID for stage
//
// Any unresolved piece comes back as null — the modal renders a
// warning rather than blocking the push (push-to-crm itself will
// reject if the resolution genuinely fails).

interface StageRow { id: number; name: string }
interface PipelineRow { id: number; name: string }

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
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
  const appUser = await getUserByAuthId(user.id);
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServerClient();
  const { data: conv } = await supabase
    .from('conversations')
    .select('brand')
    .eq('id', params.id)
    .single();
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const brand = String(conv.brand);
  const brandKey = brand.toUpperCase();

  // Stage resolution — mirrors push-to-crm/route.ts. brand_settings is
  // checked first since that's the canonical home post-migration.
  let pipelineId: number | null = null;
  let stageId: number | null = null;

  const { data: settings } = await supabase
    .from('brand_settings')
    .select('initial_stage_id')
    .eq('brand', brand)
    .maybeSingle();
  if (settings?.initial_stage_id) {
    stageId = settings.initial_stage_id as number;
  }

  // Env-var override path.
  const envPipeline = process.env[`CRM_PIPELINE_${brandKey}_ID`];
  if (envPipeline) pipelineId = parseInt(envPipeline);
  if (!stageId) {
    const envStage = process.env[`CRM_PIPELINE_${brandKey}_INITIAL_STAGE_ID`];
    if (envStage) stageId = parseInt(envStage);
  }

  // Canonical fallback — brand IS the pipeline id.
  if (!pipelineId && /^\d+$/.test(brand)) {
    pipelineId = parseInt(brand);
  }
  if (!stageId && process.env.CRM_DEFAULT_INITIAL_STAGE_ID) {
    stageId = parseInt(process.env.CRM_DEFAULT_INITIAL_STAGE_ID);
  }

  // Resolve human-readable names from CRM. Each lookup is wrapped so
  // CRM-down doesn't break the preview — it just falls back to ids.
  let pipelineName: string | null = null;
  let stageName: string | null = null;

  if (pipelineId) {
    try {
      const rows = await queryCRM<PipelineRow[]>(
        'SELECT id, name FROM pipelines WHERE id = ? LIMIT 1',
        [pipelineId],
      );
      pipelineName = rows[0]?.name ?? null;
    } catch (err) {
      console.warn('[push-preview] pipeline name lookup failed:', err);
    }
  }
  if (stageId) {
    try {
      const rows = await queryCRM<StageRow[]>(
        'SELECT id, name FROM stages WHERE id = ? LIMIT 1',
        [stageId],
      );
      stageName = rows[0]?.name ?? null;
    } catch (err) {
      console.warn('[push-preview] stage name lookup failed:', err);
    }
  }

  return NextResponse.json({
    brand,
    brand_name: pipelineName, // pipeline name and brand name are the same thing
    pipeline_id: pipelineId,
    pipeline_name: pipelineName,
    initial_stage_id: stageId,
    initial_stage_name: stageName,
  });
}
