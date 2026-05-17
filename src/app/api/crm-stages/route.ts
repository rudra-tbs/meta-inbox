export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';

// Returns the distinct CRM stages currently in use among the user's visible
// conversations for the given brand/channel. Drives the "filter by stage" UI.
export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const brand = searchParams.get('brand') || 'TBS';
  const channel = searchParams.get('channel') || 'WA';

  const { data, error } = await supabase
    .from('conversations')
    .select('crm_stage_id, crm_stage_name')
    .eq('brand', brand)
    .eq('channel', channel)
    .eq('pushed_to_crm', true)
    .not('crm_stage_id', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const seen = new Map<number, string>();
  for (const row of data ?? []) {
    if (row.crm_stage_id != null && !seen.has(row.crm_stage_id)) {
      seen.set(row.crm_stage_id, row.crm_stage_name ?? `Stage ${row.crm_stage_id}`);
    }
  }

  const stages = Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  return NextResponse.json(stages);
}
