export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { listConfiguredChannels } from '@/lib/brand-channels';
import { queryCRM } from '@/lib/mysql-crm';

interface PipelineRow {
  id: number;
  name: string;
}

interface BrandOut {
  id: string;
  name: string;
}

// Returns the list of brands the current user can switch between in the inbox.
// - Admins: every brand that has at least one configured channel.
// - Agents: brands present in their user_access rows.
// The "name" is resolved via the CRM pipelines table; falls back to the raw
// brand id when no matching pipeline exists (e.g. orphaned legacy rows).
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
  const appUser = await getUserByAuthId(user.id);
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Resolve the set of brand ids the user is allowed to see.
  let allowedBrandIds: string[];
  if (appUser.role === 'ADMIN') {
    const configured = await listConfiguredChannels(supabase);
    allowedBrandIds = Array.from(new Set(configured.map((c) => c.brand)));
  } else {
    const { data: access } = await supabase
      .from('user_access')
      .select('brand')
      .eq('user_id', appUser.id);
    allowedBrandIds = Array.from(new Set((access ?? []).map((a) => a.brand)));
  }

  if (allowedBrandIds.length === 0) {
    return NextResponse.json([]);
  }

  // Look up display names from CRM pipelines for numeric ids. Non-numeric
  // brand ids fall through and use the id as the label.
  const numericIds = allowedBrandIds
    .filter((id) => /^\d+$/.test(id))
    .map((id) => parseInt(id));

  const nameById = new Map<string, string>();
  if (numericIds.length > 0) {
    try {
      const rows = await queryCRM<PipelineRow[]>(
        `SELECT id, name FROM pipelines WHERE id IN (${numericIds.join(',')})`
      );
      for (const r of rows) {
        nameById.set(String(r.id), r.name);
      }
    } catch (err) {
      console.warn('[api/brands] CRM pipeline lookup failed (using ids as names):', err);
    }
  }

  const out: BrandOut[] = allowedBrandIds
    .map((id) => ({
      id,
      name: nameById.get(id) ?? id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(out);
}
