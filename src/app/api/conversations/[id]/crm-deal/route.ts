export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { insertCRM, queryCRM } from '@/lib/mysql-crm';
import { logEvent } from '@/lib/activity';
import * as Sentry from '@sentry/nextjs';

// PATCH /api/conversations/[id]/crm-deal
// Body: { venue?, city?, value?, label_ids? }
//
// Writes the "precursor" fields that the stage-transition matrix asks
// for. The DetailRail flow is:
//
//   PATCH /crm-stage with stage_id
//     ↓ 400 with `missing: ['venue', 'city', 'label']`
//   open modal, collect those fields from the operator
//     ↓
//   PATCH /crm-deal with the just-collected fields
//     ↓
//   PATCH /crm-stage again with the same stage_id → succeeds
//
// We use raw MySQL on the deals + deal_labels tables (same model as
// every other CRM write in this codebase). When the CRM eventually
// exposes a proper REST endpoint with auth, this becomes a thin
// wrapper around that call.

interface DealRow { pipeline_id: number | null }

interface PatchBody {
  venue?: string | null;
  city?: string | null;
  value?: number | null;          // decimal — caller sends a number
  label_ids?: number[] | null;    // replace-all semantics on deal_labels
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

  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== 'object') {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }
  const body = raw as PatchBody;

  // Per-field validation. We only accept the four documented fields;
  // everything else is rejected so callers can't quietly write to
  // arbitrary deal columns through this endpoint.
  const venue = body.venue === undefined ? undefined : (body.venue === null ? null : String(body.venue).trim() || null);
  const city = body.city === undefined ? undefined : (body.city === null ? null : String(body.city).trim() || null);
  let value: number | null | undefined;
  if (body.value === undefined) {
    value = undefined;
  } else if (body.value === null) {
    value = null;
  } else if (typeof body.value === 'number' && Number.isFinite(body.value) && body.value >= 0 && body.value < 1_000_000_000) {
    value = body.value;
  } else {
    return NextResponse.json({ error: 'value must be a non-negative number under 1e9' }, { status: 400 });
  }
  let labelIds: number[] | null | undefined;
  if (body.label_ids === undefined) {
    labelIds = undefined;
  } else if (body.label_ids === null) {
    labelIds = null;
  } else if (Array.isArray(body.label_ids) && body.label_ids.every((n) => Number.isInteger(n) && n > 0)) {
    labelIds = body.label_ids;
  } else {
    return NextResponse.json({ error: 'label_ids must be an array of positive integers' }, { status: 400 });
  }

  if (venue === undefined && city === undefined && value === undefined && labelIds === undefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: conv } = await supabase
    .from('conversations')
    .select('crm_deal_id, pushed_to_crm')
    .eq('id', params.id)
    .single();
  if (!conv || !conv.pushed_to_crm || !conv.crm_deal_id) {
    return NextResponse.json({ error: 'Conversation not pushed to CRM' }, { status: 404 });
  }
  const dealId = conv.crm_deal_id as number;

  // Make sure the deal still exists in CRM. If it was soft-deleted under
  // us, the cron will reconcile within 5 min but we don't want to write
  // to a dead row in the meantime.
  try {
    const deals = await queryCRM<DealRow[]>(
      'SELECT pipeline_id FROM deals WHERE id = ? AND is_deleted = 0 LIMIT 1',
      [dealId],
    );
    if (deals.length === 0) {
      return NextResponse.json({ error: 'Deal not found in CRM (deleted?)' }, { status: 404 });
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { component: 'crm-deal-patch', step: 'verify' } });
    return NextResponse.json(
      { error: 'CRM lookup failed', details: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  // Build the dynamic UPDATE. Only includes columns the caller sent.
  const setClauses: string[] = [];
  const setParams: Array<string | number | null> = [];
  if (venue !== undefined) { setClauses.push('venue = ?'); setParams.push(venue); }
  if (city !== undefined) { setClauses.push('city = ?'); setParams.push(city); }
  if (value !== undefined) { setClauses.push('value = ?'); setParams.push(value); }

  try {
    if (setClauses.length > 0) {
      setClauses.push('updated_at = NOW()');
      const sql = `UPDATE deals SET ${setClauses.join(', ')} WHERE id = ?`;
      await insertCRM(sql, [...setParams, dealId]);
    }

    // deal_labels is M:N — replace-all semantics matches what the CRM
    // frontend does (`labelIds: number[]` in the API call wipes and
    // re-inserts). A null sentinel means "clear all labels"; an empty
    // array would do the same, but `undefined` skips the write entirely.
    if (labelIds !== undefined) {
      await insertCRM('DELETE FROM deal_labels WHERE deal_id = ?', [dealId]);
      if (labelIds && labelIds.length > 0) {
        const placeholders = labelIds.map(() => '(?, ?)').join(', ');
        const flat: number[] = [];
        for (const lid of labelIds) flat.push(dealId, lid);
        await insertCRM(
          `INSERT INTO deal_labels (deal_id, label_id) VALUES ${placeholders}`,
          flat,
        );
      }
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: 'crm-deal-patch', step: 'mysql_write' },
      extra: { conversation_id: params.id, crm_deal_id: dealId },
    });
    return NextResponse.json(
      { error: 'CRM write failed', details: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  await logEvent(supabase, params.id, 'CRM_STAGE_CHANGED', {
    actorUserId: appUser.id,
    actorName: appUser.name,
    metadata: {
      deal_id: dealId,
      // Reuse the existing event type with a sub-source so the activity
      // timeline shows what the operator filled in. If we ever need a
      // distinct event for "deal fields edited", add a new EventType.
      kind: 'precursor_fields',
      changed: {
        venue: venue !== undefined,
        city: city !== undefined,
        value: value !== undefined,
        label_ids: labelIds !== undefined,
      },
      source: 'app',
    },
  });

  return NextResponse.json({ ok: true });
}
