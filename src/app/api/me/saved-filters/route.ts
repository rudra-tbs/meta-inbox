export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';

// Per-user saved filter presets. Lives on users.saved_filters jsonb.
// Three operations:
//   GET    → list current user's presets
//   POST   → append a new preset (server assigns id, returns new list)
//   DELETE → ?id=… removes one preset, returns new list
//
// Hard cap of 20 to keep the column size sane; UI caps at 10 today.

interface SavedFilter {
  id: string;
  name: string;
  status: string | null;     // matches inbox StatusFilter ('all' | 'AI' | …)
  tag: string | null;        // tag string or null
  stage: number | null;      // crm_stage_id or null
}

const MAX_FILTERS = 20;

async function authedUser() {
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
  if (!user) return null;
  const appUser = await getUserByAuthId(user.id);
  if (!appUser) return null;
  return appUser;
}

async function loadFilters(userId: string): Promise<SavedFilter[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('users')
    .select('saved_filters')
    .eq('id', userId)
    .single();
  const raw = (data?.saved_filters as unknown) ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isSavedFilter);
}

function isSavedFilter(v: unknown): v is SavedFilter {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    (o.status === null || typeof o.status === 'string') &&
    (o.tag === null || typeof o.tag === 'string') &&
    (o.stage === null || typeof o.stage === 'number')
  );
}

async function writeFilters(userId: string, filters: SavedFilter[]) {
  const supabase = createServerClient();
  return supabase.from('users').update({ saved_filters: filters }).eq('id', userId);
}

export async function GET() {
  const user = await authedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await loadFilters(user.id));
}

export async function POST(request: NextRequest) {
  const user = await authedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: 'name too long' }, { status: 400 });

  const status = typeof body?.status === 'string' ? body.status : null;
  const tag = typeof body?.tag === 'string' && body.tag.length > 0 ? body.tag : null;
  const stage = typeof body?.stage === 'number' && Number.isFinite(body.stage) ? body.stage : null;

  const current = await loadFilters(user.id);
  if (current.length >= MAX_FILTERS) {
    return NextResponse.json({ error: `Limit of ${MAX_FILTERS} saved filters reached` }, { status: 400 });
  }
  // Reject duplicate names — they'd be confusing in the chip row.
  if (current.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: 'A filter with that name already exists' }, { status: 409 });
  }

  const id = Math.random().toString(36).slice(2, 10);
  const next: SavedFilter[] = [...current, { id, name, status, tag, stage }];
  const { error } = await writeFilters(user.id, next);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(next, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await authedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id query param required' }, { status: 400 });

  const current = await loadFilters(user.id);
  const next = current.filter((f) => f.id !== id);
  if (next.length === current.length) {
    return NextResponse.json(current);
  }
  const { error } = await writeFilters(user.id, next);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(next);
}
