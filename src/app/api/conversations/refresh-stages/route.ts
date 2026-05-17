export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { queryCRM } from '@/lib/mysql-crm';

interface DealStageRow {
  id: number;
  stage_id: number;
  stage_name: string | null;
}

export async function POST() {
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

  // Get all conversations that have been pushed to CRM
  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, crm_deal_id')
    .eq('pushed_to_crm', true)
    .not('crm_deal_id', 'is', null);

  if (!conversations || conversations.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const dealIds = conversations.map((c) => c.crm_deal_id);

  // Pull current stage for each deal
  let stageRows: DealStageRow[] = [];
  try {
    const placeholders = dealIds.map(() => '?').join(',');
    stageRows = await queryCRM<DealStageRow[]>(
      `SELECT d.id, d.stage_id, s.name AS stage_name
       FROM deals d
       LEFT JOIN pipeline_stages s ON s.id = d.stage_id
       WHERE d.id IN (${placeholders})`,
      dealIds
    );
  } catch (err) {
    console.error('[Refresh Stages] CRM query failed:', err);
    return NextResponse.json({ error: 'CRM query failed' }, { status: 500 });
  }

  const stageByDealId = new Map<number, { stage_id: number; stage_name: string | null }>();
  for (const r of stageRows) {
    stageByDealId.set(r.id, { stage_id: r.stage_id, stage_name: r.stage_name });
  }

  let updated = 0;
  for (const conv of conversations) {
    const stage = stageByDealId.get(conv.crm_deal_id as number);
    if (!stage) continue;
    await supabase
      .from('conversations')
      .update({
        crm_stage_id: stage.stage_id,
        crm_stage_name: stage.stage_name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conv.id);
    updated++;
  }

  console.log(`[Refresh Stages] Updated ${updated} of ${conversations.length} conversations`);
  return NextResponse.json({ updated, total: conversations.length });
}
