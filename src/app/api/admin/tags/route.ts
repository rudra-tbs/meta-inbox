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

// Same canonical form the conversations PATCH route normalizes against —
// lowercase, trimmed, # stripped if the admin paste-includes it.
// Kept local: Next.js App Router rejects non-handler exports from route files.
function normalizeTagName(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#/, '');
}

function isValidColor(v: string): boolean {
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return true;
  return /^[a-z]{3,30}$/i.test(v);
}

// GET — same shape as /api/tags but admin-only and includes audit metadata
// so the admin table can show who created what.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('tag_taxonomy')
    .select('name, display_name, color, created_at, created_by:users!created_by_user_id(name)')
    .order('display_name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => ({
    name: r.name,
    display_name: r.display_name,
    color: r.color,
    created_at: r.created_at,
    created_by_name: r.created_by?.name ?? null,
  }));
  return NextResponse.json(rows);
}

interface PostBody {
  display_name?: string;
  color?: string | null;
}

// POST — create a taxonomy entry. We derive the canonical `name` from
// display_name so there's exactly one source of truth for casing.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const displayName = String(body?.display_name ?? '').trim();
  if (!displayName) return NextResponse.json({ error: 'display_name is required' }, { status: 400 });
  if (displayName.length > 40) return NextResponse.json({ error: 'display_name max 40 chars' }, { status: 400 });

  const name = normalizeTagName(displayName);
  if (!name) return NextResponse.json({ error: 'Tag name is empty after normalizing' }, { status: 400 });

  let color: string | null = null;
  if (body.color !== undefined && body.color !== null && body.color !== '') {
    if (typeof body.color !== 'string' || !isValidColor(body.color.trim())) {
      return NextResponse.json(
        { error: 'color must be a hex value (e.g. #aabbcc) or a CSS color name' },
        { status: 400 },
      );
    }
    color = body.color.trim();
  }

  const supabase = createServerClient();
  const { error } = await supabase.from('tag_taxonomy').insert({
    name,
    display_name: displayName,
    color,
    created_by_user_id: admin.id,
  });

  if (error) {
    // Postgres unique-violation code.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A tag with that name already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, name, display_name: displayName, color }, { status: 201 });
}

// DELETE — remove a taxonomy entry. Conversations that already have this tag
// keep it on their row; admins can sweep them via a bulk update later if they
// want a hard purge. The taxonomy delete just stops further use.
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const name = (searchParams.get('name') ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name query param required' }, { status: 400 });

  const supabase = createServerClient();
  const { error } = await supabase.from('tag_taxonomy').delete().eq('name', name);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
