export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { queryCRM, insertCRM } from '@/lib/mysql-crm';
import { logEvent } from '@/lib/activity';
import * as Sentry from '@sentry/nextjs';

// PATCH /api/conversations/[id]/crm-stage
// Body: { stage_id: number }
//
// Updates the CRM deal first, then mirrors to Supabase. If the CRM
// update succeeds and Supabase fails, we still return 502 — but the
// cron in /api/cron/sync-crm will reconcile within 5 minutes, so the
// app catches up automatically.

interface StageRow { id: number; name: string; pipeline_id: number }
interface DealRow { pipeline_id: number | null }

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

  // Verify the requested stage exists and belongs to the deal's current
  // pipeline. Without this the CRM would happily accept a stage_id from
  // an unrelated pipeline, leaving the deal in an inconsistent state.
  let newStageName: string;
  try {
    const stages = await queryCRM<StageRow[]>(
      'SELECT id, name, pipeline_id FROM stages WHERE id = ? LIMIT 1',
      [stageId],
    );
    if (stages.length === 0) {
      return NextResponse.json({ error: 'Stage not found in CRM' }, { status: 404 });
    }
    const deals = await queryCRM<DealRow[]>(
      'SELECT pipeline_id FROM deals WHERE id = ? AND is_deleted = 0 LIMIT 1',
      [conv.crm_deal_id],
    );
    const dealPipeline = deals[0]?.pipeline_id;
    if (!dealPipeline) {
      return NextResponse.json({ error: 'Deal not found or has no pipeline' }, { status: 404 });
    }
    if (dealPipeline !== stages[0].pipeline_id) {
      return NextResponse.json(
        { error: "Selected stage doesn't belong to the deal's pipeline" },
        { status: 400 },
      );
    }
    newStageName = stages[0].name;
  } catch (err) {
    Sentry.captureException(err, { tags: { component: 'crm-stage-update', step: 'verify' } });
    return NextResponse.json(
      { error: 'CRM verification failed', details: err instanceof Error ? err.message : String(err) },
      { status: 502 },
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
