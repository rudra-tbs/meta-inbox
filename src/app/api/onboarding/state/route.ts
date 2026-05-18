export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { listConfiguredChannels } from '@/lib/brand-channels';
import { queryCRM } from '@/lib/mysql-crm';

interface PipelineRow {
  id: number;
  name: string;
  category: string | null;
}

export async function GET() {
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

  // Brands come from CRM pipelines. If the CRM is unreachable we return an
  // empty list rather than 500 — signup can still proceed but the user will
  // see the issue and can retry.
  let brands: Array<{ id: string; name: string; subtitle: string }> = [];
  let pipelineError: string | null = null;
  try {
    const rows = await queryCRM<PipelineRow[]>(
      'SELECT id, name, category FROM pipelines WHERE is_deleted = 0 ORDER BY name'
    );
    brands = rows.map((r) => ({
      id: String(r.id),
      name: r.name,
      subtitle: r.category ?? 'Pipeline',
    }));
  } catch (err) {
    pipelineError = err instanceof Error ? err.message : 'Could not load brands from CRM';
    console.error('[onboarding/state] CRM pipeline fetch failed:', pipelineError);
  }

  const configured = await listConfiguredChannels(supabase);

  return NextResponse.json({ brands, configured, pipelineError });
}
