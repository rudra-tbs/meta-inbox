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

// Returns the admin user list with last_sign_in_at + auth-side metadata that
// the regular /api/users endpoint doesn't expose.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createServerClient();
  const { data: rows, error } = await supabase
    .from('users')
    .select('id, auth_id, name, email, role, active, created_at, user_access(brand, channel)')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pull last_sign_in_at from auth.users via the admin API. We page through 1k
  // at a time which is more than enough for an inbox team.
  const lastSignInByAuthId = new Map<string, string | null>();
  try {
    const { data: page } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of page?.users ?? []) {
      lastSignInByAuthId.set(u.id, u.last_sign_in_at ?? null);
    }
  } catch (err) {
    console.warn('[admin/users] listUsers failed (continuing without last_sign_in_at):', err);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (rows ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    active: r.active ?? true,
    created_at: r.created_at,
    last_sign_in_at: r.auth_id ? lastSignInByAuthId.get(r.auth_id) ?? null : null,
    access: r.user_access ?? [],
  }));

  return NextResponse.json(result);
}

interface CreateUserBody {
  name: string;
  email: string;
  role: 'ADMIN' | 'AGENT';
  access: Array<{ brand: string; channel: string }>;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /api/admin/users
// Admin-driven user creation. Skips the public /signup email-domain
// allow-list because admins are trusted to invite the right addresses.
// Uses inviteUserByEmail so the new user receives an email with a one-time
// link that lands them on /auth/reset-password to set their own password —
// the admin never sees or chooses the password.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: CreateUserBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = String(body?.name ?? '').trim();
  const email = String(body?.email ?? '').trim().toLowerCase();
  const role: 'ADMIN' | 'AGENT' = body?.role === 'ADMIN' ? 'ADMIN' : 'AGENT';
  const access = Array.isArray(body?.access) ? body.access : [];

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });

  const supabase = createServerClient();

  // Reject duplicates on the users table.
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
  }

  // Send the invite — Supabase generates the auth user and emails the link.
  // The recovery-style link drops them on /auth/reset-password to set a password.
  const origin =
    request.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? '';
  const redirectTo = origin ? `${origin}/auth/reset-password` : undefined;

  const { data: invite, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    email,
    {
      data: { name },
      redirectTo,
    }
  );

  if (inviteError || !invite.user) {
    return NextResponse.json(
      { error: inviteError?.message ?? 'Could not send invite' },
      { status: 500 }
    );
  }

  // Create the users row linked to the new auth user.
  const { data: createdUser, error: insertError } = await supabase
    .from('users')
    .insert({
      auth_id: invite.user.id,
      name,
      email,
      role,
    })
    .select('id')
    .single();

  if (insertError || !createdUser) {
    // Roll back the auth user so the admin can retry cleanly.
    try {
      await supabase.auth.admin.deleteUser(invite.user.id);
    } catch (err) {
      console.warn('[admin/users POST] cleanup of orphan auth user failed:', err);
    }
    return NextResponse.json(
      { error: insertError?.message ?? 'Could not create user row' },
      { status: 500 }
    );
  }

  // Insert initial access rows (agents only — admins ignore user_access).
  if (role === 'AGENT' && access.length > 0) {
    const accessRows = access
      .filter((a) => a && typeof a.brand === 'string' && typeof a.channel === 'string')
      .map((a) => ({
        user_id: createdUser.id,
        brand: a.brand,
        channel: a.channel,
      }));
    if (accessRows.length > 0) {
      const { error: accessError } = await supabase
        .from('user_access')
        .insert(accessRows);
      if (accessError) {
        console.warn('[admin/users POST] access insert failed (user created without access):', accessError);
      }
    }
  }

  return NextResponse.json(
    { id: createdUser.id, email, name, role, invited: true },
    { status: 201 }
  );
}
