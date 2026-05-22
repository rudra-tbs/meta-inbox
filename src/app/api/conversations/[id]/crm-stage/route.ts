export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { queryCRM, insertCRM } from '@/lib/mysql-crm';
import { logEvent } from '@/lib/activity';
import { evaluateStageRequirements, type DealContext } from '@/lib/crm-stage-requirements';
import * as Sentry from '@sentry/nextjs';

// PATCH /api/conversations/[id]/crm-stage
// Body: { stage_id: number }
//
// Updates the CRM deal first, then mirrors to Supabase. If the CRM
// update succeeds and Supabase fails, we still return 502 — but the
// cron in /api/cron/sync-crm will reconcile within 5 minutes, so the
// app catches up automatically.
//
// Before any of that, we evaluate the stage-transition requirements
// matrix (src/lib/crm-stage-requirements.ts) against live CRM data.
// Validation rules live entirely in the CRM frontend today; we mirror
// them here so a stage move from DetailRail can't bypass guards the
// CRM Dashboard enforces. When a rule fires we return 400 with
// `missing` + `ux` so the inbox can either open the inline form
// (ux=modal) or surface a toast and bounce (ux=toast).

interface StageRow { id: number; name: string; pipeline_id: number; stage_order: number | null }
interface PipelineStageRow { id: number; name: string; stage_order: number | null }
interface DealCtxRow {
  pipeline_id: number | null;
  venue: string | null;
  city: string | null;
  value: string | null;            // mysql2 returns DECIMAL as string
  category_id: number | null;
  person_id: number | null;
  current_stage_id: number | null;
  current_stage_name: string | null;
  current_stage_order: number | null;
  pipeline_name: string | null;
  pipeline_category: string | null;
  org_category: string | null;
  category_name: string | null;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
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

  const body = await request.json().catch(() => null);
  const stageId = typeof body?.stage_id === 'number' && Number.isInteger(body.stage_id)
    ? body.stage_id
    : null;
  if (!stageId) {
    return NextResponse.json({ error: 'stage_id (integer) is required' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: conv } = await supabase
    .from('conversations')
    .select('crm_deal_id, crm_stage_id, crm_stage_name, pushed_to_crm')
    .eq('id', params.id)
    .single();
  if (!conv || !conv.pushed_to_crm || !conv.crm_deal_id) {
    return NextResponse.json({ error: 'Conversation not pushed to CRM' }, { status: 404 });
  }
  if (conv.crm_stage_id === stageId) {
    return NextResponse.json({
      ok: true,
      no_change: true,
      crm_stage_id: stageId,
      crm_stage_name: conv.crm_stage_name,
    });
  }

  // Verify the requested stage exists, belongs to the deal's pipeline,
  // AND that the deal satisfies the stage-transition requirements
  // mirrored from the CRM frontend in lib/crm-stage-requirements.
  let newStageName: string;
  let targetStageOrder: number;
  let dealCtx: DealCtxRow;
  let pipelineStages: PipelineStageRow[];
  let hasAnyLabel: boolean;
  let personPhone: string | null;
  let openActivityCount: number;
  try {
    const stages = await queryCRM<StageRow[]>(
      'SELECT id, name, pipeline_id, stage_order FROM stages WHERE id = ? LIMIT 1',
      [stageId],
    );
    if (stages.length === 0) {
      return NextResponse.json({ error: 'Stage not found in CRM' }, { status: 404 });
    }
    // One join query pulls every column the requirements helper needs:
    // deal fields, pipeline metadata, organization category, deal category.
    const dealRows = await queryCRM<DealCtxRow[]>(
      `SELECT
         d.pipeline_id,
         d.venue,
         d.city,
         d.value,
         d.category_id,
         d.person_id,
         d.stage_id AS current_stage_id,
         s.name AS current_stage_name,
         s.stage_order AS current_stage_order,
         p.name AS pipeline_name,
         p.category AS pipeline_category,
         o.category AS org_category,
         c.name AS category_name
       FROM deals d
       LEFT JOIN stages s ON s.id = d.stage_id
       LEFT JOIN pipelines p ON p.id = d.pipeline_id
       LEFT JOIN organizations o ON o.id = p.organization_id
       LEFT JOIN categories c ON c.id = d.category_id
       WHERE d.id = ? AND d.is_deleted = 0
       LIMIT 1`,
      [conv.crm_deal_id],
    );
    if (dealRows.length === 0) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }
    dealCtx = dealRows[0];
    const dealPipeline = dealCtx.pipeline_id;
    if (!dealPipeline) {
      return NextResponse.json({ error: 'Deal has no pipeline' }, { status: 404 });
    }
    if (dealPipeline !== stages[0].pipeline_id) {
      return NextResponse.json(
        { error: "Selected stage doesn't belong to the deal's pipeline" },
        { status: 400 },
      );
    }
    newStageName = stages[0].name;
    targetStageOrder = stages[0].stage_order ?? 0;

    // Pipeline's stages, ordered. The requirements helper finds Contact
    // Made / Follow Up / Lead In by name and compares stage_order to the
    // target, so it needs the whole list.
    pipelineStages = await queryCRM<PipelineStageRow[]>(
      'SELECT id, name, stage_order FROM stages WHERE pipeline_id = ? ORDER BY stage_order, id',
      [dealPipeline],
    );

    // ≥1 row in deal_labels means the deal has at least one label
    // assigned (the M:N model the CRM uses today).
    const labelRows = await queryCRM<Array<{ n: number }>>(
      'SELECT COUNT(*) AS n FROM deal_labels WHERE deal_id = ?',
      [conv.crm_deal_id],
    );
    hasAnyLabel = (labelRows[0]?.n ?? 0) > 0;

    // Person phone — for the Lead-In gate.
    if (dealCtx.person_id) {
      const pRows = await queryCRM<Array<{ phone: string | null }>>(
        'SELECT phone FROM persons WHERE id = ? AND is_deleted = 0 LIMIT 1',
        [dealCtx.person_id],
      );
      personPhone = pRows[0]?.phone ?? null;
    } else {
      personPhone = null;
    }

    // Activities — bit(1) `done` is the CRM's completed flag (see
    // entity Activity). Count anything not done to drive the gate.
    const aRows = await queryCRM<Array<{ n: number }>>(
      'SELECT COUNT(*) AS n FROM activities WHERE deal_id = ? AND done = 0',
      [conv.crm_deal_id],
    );
    openActivityCount = aRows[0]?.n ?? 0;
  } catch (err) {
    Sentry.captureException(err, { tags: { component: 'crm-stage-update', step: 'verify' } });
    return NextResponse.json(
      { error: 'CRM verification failed', details: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  // Build the validation context and run the matrix. If any rule fires
  // we return 400 with a structured `missing` array so the UI can open
  // the right modal (for 'modal' UX) or display a toast (for 'toast' UX).
  const ctx: DealContext = {
    deal: {
      id: conv.crm_deal_id,
      venue: dealCtx.venue,
      city: dealCtx.city,
      value: dealCtx.value != null ? Number(dealCtx.value) : null,
      pipeline_id: dealCtx.pipeline_id,
    },
    pipeline: dealCtx.pipeline_id
      ? {
          id: dealCtx.pipeline_id,
          name: dealCtx.pipeline_name ?? `#${dealCtx.pipeline_id}`,
          category: dealCtx.pipeline_category,
        }
      : null,
    organization_category: dealCtx.org_category,
    category_name: dealCtx.category_name,
    has_any_label: hasAnyLabel,
    person_phone: personPhone,
    open_activity_count: openActivityCount,
    current_stage: {
      id: dealCtx.current_stage_id ?? 0,
      name: dealCtx.current_stage_name ?? '',
      stage_order: dealCtx.current_stage_order ?? 0,
    },
    target_stage: {
      id: stageId,
      name: newStageName,
      stage_order: targetStageOrder,
    },
    pipeline_stages: pipelineStages.map((s) => ({
      id: s.id,
      name: s.name,
      stage_order: s.stage_order ?? 0,
    })),
  };
  const verdict = evaluateStageRequirements(ctx);
  if (!verdict.ok) {
    return NextResponse.json(
      {
        error: verdict.message,
        rule: verdict.rule,
        missing: verdict.missing,
        ux: verdict.ux,
        target_stage_name: newStageName,
      },
      { status: 400 },
    );
  }

  // Update CRM. Bumps updated_at; pipeline_history is NOT maintained here
  // because that's a CRM-side workflow column — analytics that consume it
  // may miss this transition.
  try {
    await insertCRM(
      'UPDATE deals SET stage_id = ?, updated_at = NOW() WHERE id = ?',
      [stageId, conv.crm_deal_id],
    );
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: 'crm-stage-update', step: 'crm_update' },
      extra: { conversation_id: params.id, crm_deal_id: conv.crm_deal_id, stage_id: stageId },
    });
    return NextResponse.json(
      { error: 'CRM update failed', details: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('conversations')
    .update({
      crm_stage_id: stageId,
      crm_stage_name: newStageName,
      updated_at: now,
    })
    .eq('id', params.id);

  if (updateErr) {
    // CRM is the source of truth — we'll catch up on the next cron tick.
    Sentry.captureException(
      new Error(`Supabase update failed after CRM stage change deal=${conv.crm_deal_id}: ${updateErr.message}`),
      {
        tags: { component: 'crm-stage-update', step: 'supabase_update' },
        extra: { conversation_id: params.id, crm_deal_id: conv.crm_deal_id, stage_id: stageId },
      },
    );
    return NextResponse.json(
      {
        error: 'CRM updated but local sync failed; cron will reconcile within 5 minutes',
        crm_stage_id: stageId,
        crm_stage_name: newStageName,
      },
      { status: 502 },
    );
  }

  await logEvent(supabase, params.id, 'CRM_STAGE_CHANGED', {
    actorUserId: appUser.id,
    actorName: appUser.name,
    metadata: {
      deal_id: conv.crm_deal_id,
      from_stage_id: conv.crm_stage_id,
      from_stage_name: conv.crm_stage_name,
      to_stage_id: stageId,
      to_stage_name: newStageName,
      source: 'app',
    },
  });

  return NextResponse.json({
    ok: true,
    crm_stage_id: stageId,
    crm_stage_name: newStageName,
  });
}
