export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { queryCRM, insertCRM } from '@/lib/mysql-crm';
import { logEvent } from '@/lib/activity';
import * as Sentry from '@sentry/nextjs';

interface PushBody {
  client_name: string;
  city: string | null;
  wedding_date: string | null;
  guest_count: string | null;
  budget: number | null;
  service_type: string | null;
  assign_to_crm_user_id: number | null;
  notes: string | null;
}

interface CRMUserRow { id: number; first_name: string; last_name: string; }

// Runtime body validation. We accept anything that looks like a PushBody and
// rejects with a 400 listing the exact field. Replaces `body as PushBody`.
function validatePushBody(raw: unknown): { ok: true; body: PushBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Body must be a JSON object' };
  const b = raw as Record<string, unknown>;
  if (typeof b.client_name !== 'string' || !b.client_name.trim()) {
    return { ok: false, error: 'client_name is required' };
  }
  if (b.client_name.length > 200) return { ok: false, error: 'client_name too long' };
  const stringOrNull = (v: unknown, name: string, max = 500): string | null | undefined => {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'string') return undefined;
    if (v.length > max) return undefined;
    return v;
  };
  const city = stringOrNull(b.city, 'city', 120);
  const wedding_date = stringOrNull(b.wedding_date, 'wedding_date', 60);
  const guest_count = stringOrNull(b.guest_count, 'guest_count', 60);
  const service_type = stringOrNull(b.service_type, 'service_type', 120);
  const notes = stringOrNull(b.notes, 'notes', 4000);
  if (city === undefined) return { ok: false, error: 'city invalid' };
  if (wedding_date === undefined) return { ok: false, error: 'wedding_date invalid' };
  if (guest_count === undefined) return { ok: false, error: 'guest_count invalid' };
  if (service_type === undefined) return { ok: false, error: 'service_type invalid' };
  if (notes === undefined) return { ok: false, error: 'notes invalid' };
  let budget: number | null = null;
  if (b.budget !== null && b.budget !== undefined) {
    if (typeof b.budget !== 'number' || !Number.isFinite(b.budget) || b.budget < 0 || b.budget > 1_000_000_000) {
      return { ok: false, error: 'budget invalid' };
    }
    budget = b.budget;
  }
  let assign_to_crm_user_id: number | null = null;
  if (b.assign_to_crm_user_id !== null && b.assign_to_crm_user_id !== undefined) {
    if (typeof b.assign_to_crm_user_id !== 'number' || !Number.isInteger(b.assign_to_crm_user_id)) {
      return { ok: false, error: 'assign_to_crm_user_id invalid' };
    }
    assign_to_crm_user_id = b.assign_to_crm_user_id;
  }
  return {
    ok: true,
    body: {
      client_name: b.client_name.trim(),
      city,
      wedding_date,
      guest_count,
      budget,
      service_type,
      assign_to_crm_user_id,
      notes,
    },
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

  const supabase = createServerClient();
  const appUser = await getUserByAuthId(user.id);
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rawBody = await request.json().catch(() => null);
  const validated = validatePushBody(rawBody);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const body = validated.body;

  // Fetch conversation (read-only — the actual concurrency guard is the
  // atomic lock UPDATE below).
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', params.id)
    .single();

  if (convErr || !conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  if (conv.pushed_to_crm) {
    return NextResponse.json({ error: 'Already pushed to CRM' }, { status: 409 });
  }

  // Resolve pipeline/stage BEFORE acquiring the lock so a misconfigured
  // brand fails fast without leaving a half-acquired flag.
  //
  // Lookup order — brand IS the CRM pipeline id in the canonical
  // (post 2026_05_brand_is_pipeline_id) data model. The brand_pipelines
  // mapping table is dropped; we only look at it as a transitional
  // fallback for environments where the SQL migration hasn't run yet.
  //
  //   1. brand_settings.initial_stage_id     — per-brand initial stage.
  //   2. brand_pipelines table               — LEGACY; ignored when the
  //                                            table no longer exists.
  //   3. CRM_PIPELINE_<BRAND>_(ID|INITIAL_STAGE_ID) env vars.
  //   4. parseInt(brand) for pipeline_id;
  //      CRM_DEFAULT_INITIAL_STAGE_ID for stage.
  const brandKey = String(conv.brand).toUpperCase();

  let pipeline_id: number | null = null;
  let stage_id: number | null = null;

  // 1. brand_settings (new canonical home for initial_stage_id and the
  // per-brand CRM category id). crm_category_id is read here so we can
  // pass it into the deal INSERT below; null leaves category_id unset on
  // the deal, preserving legacy behaviour for brands that haven't been
  // configured yet.
  const { data: settings } = await supabase
    .from('brand_settings')
    .select('initial_stage_id, crm_category_id')
    .eq('brand', String(conv.brand))
    .maybeSingle();
  if (settings?.initial_stage_id) {
    stage_id = settings.initial_stage_id as number;
  }
  const crmCategoryId: number | null = (settings?.crm_category_id as number | null | undefined) ?? null;

  // 2. brand_pipelines — silent legacy fallback. If the table has been
  //    dropped by the SQL migration, Supabase returns an error and `data`
  //    stays null; we just fall through. Avoids a hard dependency on the
  //    table's existence so this code is safe before, during, and after
  //    the migration.
  if (!pipeline_id || !stage_id) {
    const { data: mapping } = await supabase
      .from('brand_pipelines')
      .select('pipeline_id, initial_stage_id')
      .eq('brand', String(conv.brand))
      .maybeSingle();
    if (mapping) {
      pipeline_id ??= mapping.pipeline_id as number;
      stage_id ??= mapping.initial_stage_id as number;
    }
  }

  // 3. Per-brand env vars (per-deployment override).
  if (!pipeline_id) {
    const envPipeline = process.env[`CRM_PIPELINE_${brandKey}_ID`];
    if (envPipeline) pipeline_id = parseInt(envPipeline);
  }
  if (!stage_id) {
    const envStage = process.env[`CRM_PIPELINE_${brandKey}_INITIAL_STAGE_ID`];
    if (envStage) stage_id = parseInt(envStage);
  }

  // 4. Canonical: brand IS the pipeline id. Default stage from env.
  if (!pipeline_id && /^\d+$/.test(String(conv.brand))) {
    pipeline_id = parseInt(String(conv.brand));
  }
  if (!stage_id && process.env.CRM_DEFAULT_INITIAL_STAGE_ID) {
    stage_id = parseInt(process.env.CRM_DEFAULT_INITIAL_STAGE_ID);
  }

  if (!pipeline_id || !stage_id) {
    return NextResponse.json(
      { error: `CRM pipeline / initial stage not configured for brand "${conv.brand}". Set brand_settings.initial_stage_id (admin → Pipelines) or CRM_DEFAULT_INITIAL_STAGE_ID env var.` },
      { status: 400 }
    );
  }

  // Atomic lock: conditional UPDATE flips pushed_by_user_id and stamps
  // pushed_to_crm_at. Two concurrent requests race here — only one's
  // WHERE clause matches (pushed_to_crm = false AND pushed_by_user_id IS NULL).
  // The loser gets no row back and returns 409. On failure of the CRM
  // calls we roll this flag back so the conversation can be retried.
  const lockNow = new Date().toISOString();
  const { data: locked, error: lockErr } = await supabase
    .from('conversations')
    .update({ pushed_by_user_id: appUser.id, pushed_to_crm_at: lockNow, updated_at: lockNow })
    .eq('id', params.id)
    .eq('pushed_to_crm', false)
    .is('pushed_by_user_id', null)
    .select('id')
    .maybeSingle();
  if (lockErr) {
    console.error('[Push CRM] Lock acquire failed:', lockErr);
    return NextResponse.json({ error: 'Could not acquire push lock', details: lockErr.message }, { status: 500 });
  }
  if (!locked) {
    return NextResponse.json({ error: 'Push already in progress or completed' }, { status: 409 });
  }

  // Helper to roll back the lock on any failure path below.
  async function releaseLock() {
    await supabase
      .from('conversations')
      .update({ pushed_by_user_id: null, pushed_to_crm_at: null, updated_at: new Date().toISOString() })
      .eq('id', params.id);
  }

  // Look up logged-in user's CRM ID by email. Best-effort — falls back to
  // null created_by if the CRM is unreachable or the email isn't on the CRM.
  let createdByCRMId: number | null = null;
  let createdByName: string = appUser.name;
  try {
    const crmUserRows = await queryCRM<CRMUserRow[]>(
      'SELECT id, first_name, last_name FROM users WHERE email = ? AND active = 1 LIMIT 1',
      [appUser.email]
    );
    if (crmUserRows.length > 0) {
      createdByCRMId = crmUserRows[0].id;
      createdByName = `${crmUserRows[0].first_name} ${crmUserRows[0].last_name}`.trim();
    }
  } catch (err) {
    console.warn('[Push CRM] Could not resolve creator CRM user:', err);
  }

  // Sub-source by channel. Note: persons.sub_source AND deals.deal_sub_source
  // both use the same enum {INSTAGRAM, WHATSAPP, LANDING_PAGE, EMAIL} in the
  // CRM schema, so this string serves both inserts.
  const deal_sub_source = conv.channel === 'IG' ? 'INSTAGRAM' : 'WHATSAPP';
  const isIG = conv.channel === 'IG';

  // phone_num: strip leading country code if 91XXXXXXXXXX (12 digits → last 10).
  // For IG conversations the phone_number column actually holds the IG-scoped
  // sender id, not a real phone, so we don't pretend it's one.
  const rawPhone = conv.phone_number as string;
  const phone_num = rawPhone.length === 12 && rawPhone.startsWith('91')
    ? rawPhone.slice(2)
    : rawPhone;
  const dealContactNumber = isIG ? '' : rawPhone.slice(0, 20);
  const personPhone = isIG ? null : rawPhone;
  const personPhoneNum = isIG ? null : phone_num;

  // 1a. Find existing CRM person. Phone is NOT unique in the CRM schema, so
  //     ON DUPLICATE KEY UPDATE silently never fires there — we'd create
  //     duplicate persons forever. Explicit SELECT-first dedup matches the
  //     "if pre-exists, reuse; else create" contract.
  let person_id: number | null = null;
  const dedupColumn = isIG ? 'instagram_id' : 'phone';
  const dedupValue: string | null = isIG ? (conv.instagram_id ?? null) : rawPhone;

  if (dedupValue) {
    try {
      const found = await queryCRM<Array<{ id: number }>>(
        `SELECT id FROM persons WHERE ${dedupColumn} = ? AND is_deleted = 0 ORDER BY id DESC LIMIT 1`,
        [dedupValue]
      );
      if (found[0]?.id) person_id = found[0].id;
    } catch (err) {
      await releaseLock();
      console.error('[Push CRM] person lookup failed:', err);
      Sentry.captureException(err, {
        tags: { component: 'push-to-crm', step: 'person_lookup', brand: conv.brand },
        extra: { conversation_id: params.id },
      });
      return NextResponse.json(
        { error: 'CRM person lookup failed', step: 'person_lookup', details: err instanceof Error ? err.message : String(err) },
        { status: 502 }
      );
    }
  }

  // 1b. No existing person → insert one. Field set matches the actual
  //     thebrideside.persons schema (NOT_NULL: name, is_deleted; rest
  //     nullable). person_source is intentionally not sent — its enum
  //     doesn't include 'DIRECT' and real production rows leave it null.
  if (!person_id) {
    try {
      const result = await insertCRM(
        `INSERT INTO persons (
           name, phone, phone_num, wedding_city, city, wedding_date,
           instagram_id, sub_source, lead_date, is_deleted, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), b'0', NOW(), NOW())`,
        [
          body.client_name,
          personPhone,
          personPhoneNum,
          body.city ?? null,
          body.city ?? null,
          body.wedding_date ?? null,
          conv.instagram_id ?? null,
          deal_sub_source,
        ]
      );
      person_id = result.insertId;
    } catch (err) {
      await releaseLock();
      console.error('[Push CRM] person insert failed:', err);
      Sentry.captureException(err, {
        tags: { component: 'push-to-crm', step: 'person_insert', brand: conv.brand },
        extra: { conversation_id: params.id },
      });
      return NextResponse.json(
        { error: 'CRM person insert failed', step: 'person_insert', details: err instanceof Error ? err.message : String(err) },
        { status: 502 }
      );
    }
  }

  if (!person_id) {
    await releaseLock();
    console.error('[Push CRM] could not resolve person_id (dedup+insert both yielded nothing)');
    return NextResponse.json(
      { error: 'Could not resolve person_id', step: 'person_lookup' },
      { status: 502 }
    );
  }

  // 2. Insert deal — only generic columns. Brand-specific fields (e.g. TBS's
  // tbs_service_type / interested_in_planning / interested_in_decor) used to
  // be written here; they were dropped when brands became pipeline-driven.
  // Planners fill in pipeline-specific fields from the CRM after handoff.
  //
  // Schema-aligned deal INSERT. Notes on the actual thebrideside.deals
  // schema (verified via information_schema 2026-05-25):
  //   - deals.budget is decimal(10,2) — overflows at ~10 crore. The CRM
  //     team treats client_budget (decimal(15,2)) as the canonical
  //     "what the lead said" field, so we only write that one now. budget
  //     stays null on inbox-pushed deals.
  //   - deals.event_date (DATE) is legacy; the CRM frontend now writes
  //     deals.event_dates (JSON array of date strings). We dual-write so
  //     analytics that read either column see inbox deals.
  //   - deals.category_id (bigint FK to categories) is populated on
  //     99.97% of CRM deals. We source it from brand_settings.crm_category_id
  //     so each brand maps to exactly one CRM category (TBS → Planning
  //     and Decor, Revaah Decor → Revaah Decor, etc.). Null when the
  //     brand hasn't been configured yet — leaves the column unset, same
  //     as legacy behaviour.
  //   - contact_number (varchar(20) NOT NULL).
  //   - value (decimal(12,2) NOT NULL) — 0.00 for unbooked leads;
  //     planners fill the real value during negotiation.
  //   - status uses {WON, LOST, IN_PROGRESS}. New leads → 'IN_PROGRESS'.
  //   - created_by is the {USER, BOT} enum, NOT the user id (that goes
  //     into created_by_user_id).
  //   - deal_owner_override (bit(1) NOT NULL, no default).
  const eventDate = body.wedding_date ?? null;
  const eventDatesJson = eventDate ? JSON.stringify([eventDate]) : null;
  let crmDealId: number;
  try {
    const dealResult = await insertCRM(
      `INSERT INTO deals (
         name, contact_number, phone_number, person_name, city,
         event_date, event_dates,
         expected_gathering, client_budget, value,
         category_id,
         pipeline_id, stage_id, status,
         deal_source, deal_sub_source,
         created_by, created_by_name, created_by_user_id,
         notes, person_id, owner_id, deal_owner_override,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?,
                 ?, ?,
                 ?, ?, 0,
                 ?,
                 ?, ?, 'IN_PROGRESS',
                 'DIRECT', ?,
                 'USER', ?, ?,
                 ?, ?, ?, b'0',
                 NOW(), NOW())`,
      [
        body.client_name,                  // name
        dealContactNumber,                 // contact_number (NOT NULL; '' for IG)
        rawPhone,                          // phone_number
        body.client_name,                  // person_name
        body.city ?? null,                 // city
        eventDate,                         // event_date (legacy DATE column)
        eventDatesJson,                    // event_dates (JSON array — current canonical column)
        body.guest_count ?? null,          // expected_gathering
        body.budget ?? null,               // client_budget
        // value = 0 literal
        crmCategoryId,                     // category_id (from brand_settings.crm_category_id)
        pipeline_id,
        stage_id,
        // status = 'IN_PROGRESS' literal
        // deal_source = 'DIRECT' literal
        deal_sub_source,                   // deal_sub_source
        // created_by = 'USER' literal (enum, not the user id)
        createdByName,                     // created_by_name
        createdByCRMId,                    // created_by_user_id
        body.notes ?? null,                // notes
        person_id,                         // person_id
        body.assign_to_crm_user_id ?? createdByCRMId,  // owner_id
        // deal_owner_override = b'0' literal
      ]
    );
    crmDealId = dealResult.insertId;
  } catch (err) {
    await releaseLock();
    console.error('[Push CRM] deal insert failed:', err);
    Sentry.captureException(err, {
      tags: { component: 'push-to-crm', step: 'deal_insert', brand: conv.brand },
      extra: { conversation_id: params.id, person_id },
    });
    return NextResponse.json(
      { error: 'CRM deal insert failed', step: 'deal_insert', details: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }

  // 3. Update Supabase conversation. From here on a failure leaves a deal
  //    in CRM that we can't lose track of, so we return the crm_deal_id
  //    in the error response — the UI can surface it and we can recover
  //    by hand.
  const now = new Date().toISOString();
  let initialStageName: string | null = null;
  try {
    const stageRows = await queryCRM<{ name: string }[]>(
      'SELECT name FROM stages WHERE id = ? LIMIT 1',
      [stage_id]
    );
    initialStageName = stageRows[0]?.name ?? null;
  } catch (err) {
    console.warn('[Push CRM] Could not resolve stage name:', err);
  }

  const { error: updateErr } = await supabase
    .from('conversations')
    .update({
      pushed_to_crm: true,
      crm_deal_id: crmDealId,
      crm_stage_id: stage_id,
      crm_stage_name: initialStageName,
      pushed_to_crm_at: now,
      pushed_by_user_id: appUser.id,
      updated_at: now,
    })
    .eq('id', params.id);

  if (updateErr) {
    console.error('[Push CRM] Supabase update failed after CRM insert:', updateErr, '— deal_id=', crmDealId);
    Sentry.captureException(new Error(`Supabase update failed after CRM deal ${crmDealId}: ${updateErr.message}`), {
      tags: { component: 'push-to-crm', step: 'supabase_update', brand: conv.brand },
      extra: { conversation_id: params.id, crm_deal_id: crmDealId },
    });
    return NextResponse.json(
      {
        error: 'Deal created in CRM but Supabase update failed — please refresh and verify',
        step: 'supabase_update',
        crm_deal_id: crmDealId,
        details: updateErr.message,
      },
      { status: 502 }
    );
  }

  console.log(`[Push CRM] conversation=${params.id} → deal_id=${crmDealId} person_id=${person_id}`);

  await logEvent(supabase, params.id, 'PUSHED_TO_CRM', {
    actorUserId: appUser.id,
    actorName: appUser.name,
    metadata: { deal_id: crmDealId, person_id, pipeline_id, stage_id },
  });

  return NextResponse.json({ ok: true, crm_deal_id: crmDealId });
}
