export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { queryCRM, insertCRM } from '@/lib/mysql-crm';
import { logEvent } from '@/lib/activity';

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

  // Fetch conversation
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

  const body = (await request.json()) as PushBody;

  // Look up logged-in user's CRM ID by email
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

  // Resolve pipeline/stage for this brand.
  //
  // Lookup order:
  //   1. brand_pipelines table (admin-editable from /admin → Pipelines).
  //   2. CRM_PIPELINE_<BRAND>_ID + CRM_PIPELINE_<BRAND>_INITIAL_STAGE_ID env
  //      vars (BRAND uppercased) — per-deployment override.
  //   3. If the brand string is numeric (the canonical case post
  //      brands_from_pipelines migration), use it as the pipeline_id and
  //      require CRM_DEFAULT_INITIAL_STAGE_ID for the initial stage.
  const brandKey = String(conv.brand).toUpperCase();

  let pipeline_id: number | null = null;
  let stage_id: number | null = null;

  const { data: mapping } = await supabase
    .from('brand_pipelines')
    .select('pipeline_id, initial_stage_id')
    .eq('brand', String(conv.brand))
    .maybeSingle();
  if (mapping) {
    pipeline_id = mapping.pipeline_id;
    stage_id = mapping.initial_stage_id;
  }

  if (!pipeline_id) {
    const envPipeline = process.env[`CRM_PIPELINE_${brandKey}_ID`];
    if (envPipeline) pipeline_id = parseInt(envPipeline);
  }
  if (!stage_id) {
    const envStage = process.env[`CRM_PIPELINE_${brandKey}_INITIAL_STAGE_ID`];
    if (envStage) stage_id = parseInt(envStage);
  }

  if (!pipeline_id && /^\d+$/.test(String(conv.brand))) {
    pipeline_id = parseInt(String(conv.brand));
  }
  if (!stage_id && process.env.CRM_DEFAULT_INITIAL_STAGE_ID) {
    stage_id = parseInt(process.env.CRM_DEFAULT_INITIAL_STAGE_ID);
  }

  if (!pipeline_id || !stage_id) {
    return NextResponse.json(
      { error: `CRM pipeline not configured for brand "${conv.brand}". An admin can map it under /admin → Pipelines.` },
      { status: 500 }
    );
  }

  // Sub-source by channel
  const deal_sub_source = conv.channel === 'IG' ? 'INSTAGRAM' : 'WHATSAPP';

  // phone_num: strip leading country code if 91XXXXXXXXXX (12 digits → last 10)
  const rawPhone = conv.phone_number as string;
  const phone_num = rawPhone.length === 12 && rawPhone.startsWith('91')
    ? rawPhone.slice(2)
    : rawPhone;

  // 1. Insert/upsert person
  await insertCRM(
    `INSERT INTO persons
       (name, phone, phone_num, wedding_city, city, wedding_date, instagram_id,
        person_source, sub_source, lead_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'DIRECT', ?, CURDATE(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       name=VALUES(name), wedding_city=VALUES(wedding_city),
       updated_at=NOW(), id=LAST_INSERT_ID(id)`,
    [
      body.client_name,
      rawPhone,
      phone_num,
      body.city ?? null,
      body.city ?? null,
      body.wedding_date ?? null,
      conv.instagram_id ?? null,
      deal_sub_source,
    ]
  );

  // Get person_id (works for both insert and duplicate-key update cases)
  const personIdRows = await queryCRM<{ id: number }[]>(
    'SELECT id FROM persons WHERE phone = ? LIMIT 1',
    [rawPhone]
  );
  const person_id = personIdRows[0]?.id ?? null;

  // 2. Insert deal — only generic columns. Brand-specific fields (e.g. TBS's
  // tbs_service_type / interested_in_planning / interested_in_decor) used to
  // be written here; they were dropped when brands became pipeline-driven.
  // Planners fill in pipeline-specific fields from the CRM after handoff.
  const dealResult = await insertCRM(
    `INSERT INTO deals
       (name, phone_number, person_name, city, event_date, expected_gathering,
        client_budget, budget, pipeline_id, stage_id, status, deal_source,
        deal_sub_source, created_by, created_by_name, created_by_user_id,
        notes, person_id, owner_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'DIRECT', ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      body.client_name,                  // name
      rawPhone,                          // phone_number
      body.client_name,                  // person_name
      body.city ?? null,                 // city
      body.wedding_date ?? null,         // event_date
      body.guest_count ?? null,          // expected_gathering
      body.budget ?? null,               // client_budget
      body.budget ?? null,               // budget
      pipeline_id,
      stage_id,
      deal_sub_source,
      createdByCRMId,                    // created_by
      createdByName,                     // created_by_name
      createdByCRMId,                    // created_by_user_id
      body.notes ?? null,
      person_id,
      body.assign_to_crm_user_id ?? createdByCRMId,  // owner_id
    ]
  );

  const crmDealId = dealResult.insertId;

  // 3. Update Supabase conversation
  const now = new Date().toISOString();
  // Look up the initial stage name from the CRM
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
    console.error('[Push CRM] Supabase update failed after CRM insert:', updateErr);
  }

  console.log(`[Push CRM] conversation=${params.id} → deal_id=${crmDealId} person_id=${person_id}`);

  await logEvent(supabase, params.id, 'PUSHED_TO_CRM', {
    actorUserId: appUser.id,
    actorName: appUser.name,
    metadata: { deal_id: crmDealId, person_id, pipeline_id, stage_id },
  });

  return NextResponse.json({ ok: true, crm_deal_id: crmDealId });
}
