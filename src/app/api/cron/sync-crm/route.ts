export const dynamic = 'force-dynamic';
// CRM stage data is fetched per-deal; 30 s is plenty for a few thousand rows.
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { queryCRM } from '@/lib/mysql-crm';
import { logEvent } from '@/lib/activity';
import * as Sentry from '@sentry/nextjs';

// CRM → App reconciliation. Vercel Cron hits this every 5 minutes (see
// vercel.json). For every conversation with pushed_to_crm=true we ask the
// CRM what the deal looks like now and patch our row to match:
//
//   - deal hard-deleted (row missing from MySQL)      → clear push state
//   - deal soft-deleted (is_deleted=1)                → clear push state
//   - stage_id changed since we last saw it           → patch + log event
//
// We do NOT touch conversations whose deal still looks the same — keeps
// the cron idempotent and quiet under steady-state.

interface DealRow {
  id: number;
  stage_id: number | null;
  stage_name: string | null;
  is_deleted: number; // tinyint
}

interface PushedConv {
  id: string;
  crm_deal_id: number;
  crm_stage_id: number | null;
  crm_stage_name: string | null;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[Cron Sync CRM] CRON_SECRET not configured');
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();

  const { data: pushedRaw, error: fetchErr } = await supabase
    .from('conversations')
    .select('id, crm_deal_id, crm_stage_id, crm_stage_name')
    .eq('pushed_to_crm', true)
    .not('crm_deal_id', 'is', null);
  if (fetchErr) {
    Sentry.captureException(fetchErr, { tags: { component: 'cron-sync-crm', step: 'fetch' } });
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  const pushed = (pushedRaw ?? []) as PushedConv[];
  if (pushed.length === 0) {
    return NextResponse.json({ synced: 0, deleted: 0, total: 0 });
  }

  const dealIds = pushed.map((c) => c.crm_deal_id);
  let rows: DealRow[];
  try {
    const placeholders = dealIds.map(() => '?').join(',');
    rows = await queryCRM<DealRow[]>(
      `SELECT d.id, d.stage_id, d.is_deleted, s.name AS stage_name
       FROM deals d LEFT JOIN stages s ON s.id = d.stage_id
       WHERE d.id IN (${placeholders})`,
      dealIds,
    );
  } catch (err) {
    Sentry.captureException(err, { tags: { component: 'cron-sync-crm', step: 'crm_query' } });
    return NextResponse.json(
      { error: 'CRM query failed', details: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  const byDealId = new Map<number, DealRow>();
  for (const r of rows) byDealId.set(r.id, r);

  let stageChanged = 0;
  let deleted = 0;

  for (const conv of pushed) {
    const row = byDealId.get(conv.crm_deal_id);
    const now = new Date().toISOString();

    // Deal vanished entirely OR was soft-deleted → unlink. We deliberately
    // clear pushed_to_crm so the UI returns to the actionable "Push to CRM"
    // state; the activity log preserves the deal_id for forensics.
    if (!row || row.is_deleted) {
      await supabase
        .from('conversations')
        .update({
          pushed_to_crm: false,
          crm_deal_id: null,
          crm_stage_id: null,
          crm_stage_name: null,
          pushed_to_crm_at: null,
          pushed_by_user_id: null,
          updated_at: now,
        })
        .eq('id', conv.id);
      await logEvent(supabase, conv.id, 'CRM_DEAL_DELETED', {
        metadata: {
          deal_id: conv.crm_deal_id,
          mode: row ? 'soft_delete' : 'hard_delete',
        },
      });
      deleted++;
      continue;
    }

    // Stage drifted on the CRM side → catch up.
    if (row.stage_id !== conv.crm_stage_id) {
      await supabase
        .from('conversations')
        .update({
          crm_stage_id: row.stage_id,
          crm_stage_name: row.stage_name,
          updated_at: now,
        })
        .eq('id', conv.id);
      await logEvent(supabase, conv.id, 'CRM_STAGE_CHANGED', {
        metadata: {
          deal_id: conv.crm_deal_id,
          from_stage_id: conv.crm_stage_id,
          from_stage_name: conv.crm_stage_name,
          to_stage_id: row.stage_id,
          to_stage_name: row.stage_name,
          source: 'crm-sync',
        },
      });
      stageChanged++;
    }
  }

  console.log(`[Cron Sync CRM] checked=${pushed.length} stage_changed=${stageChanged} deleted=${deleted}`);
  return NextResponse.json({ total: pushed.length, synced: stageChanged, deleted });
}
