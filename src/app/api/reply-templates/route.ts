export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { logAdminEvent } from '@/lib/admin-events';

async function getAuthed() {
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
  return appUser;
}

// GET — anyone signed in. Agents need to see templates to use them.
export async function GET(request: NextRequest) {
  const appUser = await getAuthed();
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const brand = searchParams.get('brand');

  const supabase = createServerClient();
  let query = supabase
    .from('reply_templates')
    .select('*')
    .order('created_at', { ascending: false });
  if (brand) query = query.eq('brand', brand);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST — admin only. Templates are shared org-wide, so we curate them
// centrally rather than let any agent litter the namespace.
export async function POST(request: NextRequest) {
  const appUser = await getAuthed();
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (appUser.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only admins can create templates' }, { status: 403 });
  }

  const body = await request.json();
  const { name, content, shortcut, brand } = body as {
    name: string; content: string; shortcut?: string; brand: string;
  };

  if (!name?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'Name and content are required' }, { status: 400 });
  }
  if (!brand?.trim()) {
    return NextResponse.json({ error: 'Brand is required' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('reply_templates')
    .insert({
      brand: brand.trim(),
      name: name.trim(),
      content: content.trim(),
      shortcut: shortcut?.trim() || null,
      created_by_user_id: appUser.id,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminEvent(supabase, appUser, 'TEMPLATE_CREATED', 'reply_template', data.id, {
    brand: data.brand,
    name: data.name,
    shortcut: data.shortcut,
  });

  return NextResponse.json(data);
}
