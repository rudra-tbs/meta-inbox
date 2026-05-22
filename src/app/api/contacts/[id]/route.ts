export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';

export async function PATCH(
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

  const body = await request.json();
  // Whitelist of fields the inbox is allowed to write back to a contact.
  // Lead-qualification fields are inline-editable from DetailRail so we
  // accept them here too; identifiers (phone, instagram_id) and merge
  // metadata are NOT writeable through this endpoint — those go through
  // contact-merge.ts so dedupe and conflict-detection fire correctly.
  const allowed = [
    'notes',
    'name',
    'city',
    'wedding_date',
    'guest_count',
    'budget_range',
    'service_type',
  ] as const;
  type Field = typeof allowed[number];

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of allowed) {
    if (f in body) {
      const raw = body[f as Field];
      // Empty string → null so the contact returns to "unset" state instead
      // of holding an empty value that reads identically to filled in the UI.
      if (raw === null || raw === undefined) {
        updates[f] = null;
      } else if (typeof raw === 'string') {
        const trimmed = raw.trim();
        updates[f] = trimmed === '' ? null : trimmed;
      } else {
        updates[f] = raw;
      }
    }
  }
  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
  }

  const { error } = await supabase.from('contacts').update(updates).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
