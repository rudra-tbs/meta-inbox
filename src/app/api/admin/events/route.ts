export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';

async function requireAdmin() {
  const cookieStore = cookies();
  const supabase = createSupabaseSSR(
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const appUser = await getUserByAuthId(user.id);
  if (!appUser || appUser.role !== 'ADMIN') return null;
  return appUser;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

// GET /api/admin/events?limit=100&actor=<user_id>&target_kind=user
// Returns the most recent admin-side mutations. Empty list if the
// admin_events table doesn't exist yet (pre-migration).
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT)) || DEFAULT_LIMIT)
  );
  const actor = searchParams.get('actor');
  const targetKind = searchParams.get('target_kind');

  const supabase = createServerClient();
  let query = supabase
    .from('admin_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (actor) query = query.eq('actor_user_id', actor);
  if (targetKind) query = query.eq('target_kind', targetKind);

  const { data, error } = await query;
  if (error) {
    // Most likely the migration hasn't been run. Return empty rather than 500
    // so the UI can still render the tab with a friendly hint.
    if (/relation "?admin_events"? does not exist/i.test(error.message)) {
      return NextResponse.json({ events: [], migration_missing: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [], migration_missing: false });
}
