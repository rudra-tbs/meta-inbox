export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { queryCRM } from '@/lib/mysql-crm';

// GET /api/conversations/[id]/crm-stages
//
// Returns every stage in the deal's pipeline so the DetailRail dropdown
// can render the full set, regardless of which one the deal is currently
// in. Resolves the pipeline from the live CRM deal record (not from our
// brand_pipelines mapping) — if a planner reassigned the deal to a
// different pipeline in CRM, we follow the deal there.
interface DealRow { pipeline_id: number | null }
interface StageRow { id: number; name: string; stage_order: number | null }

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
    .select('crm_deal_id, pushed_to_crm')
    .eq('id', params.id)
    .single();
  if (!conv || !conv.pushed_to_crm || !conv.crm_deal_id) {
    return NextResponse.json({ error: 'Conversation not pushed to CRM' }, { status: 404 });
  }

  try {
    const deals = await queryCRM<DealRow[]>(
      'SELECT pipeline_id FROM deals WHERE id = ? AND is_deleted = 0 LIMIT 1',
      [conv.crm_deal_id],
    );
    const pipelineId = deals[0]?.pipeline_id;
    if (!pipelineId) {
      return NextResponse.json({ error: 'Deal not found or has no pipeline' }, { status: 404 });
    }
    const stages = await queryCRM<StageRow[]>(
      'SELECT id, name, stage_order FROM stages WHERE pipeline_id = ? ORDER BY stage_order, id',
      [pipelineId],
    );
    return NextResponse.json({ pipeline_id: pipelineId, stages });
  } catch (err) {
    return NextResponse.json(
      { error: 'CRM query failed', details: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
