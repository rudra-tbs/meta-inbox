export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { queryCRM } from '@/lib/mysql-crm';

// Env vars surfaced in the system tab. Grouped for readability.
// IMPORTANT: only the *presence* is exposed — never the value.
const ENV_GROUPS: Array<{ group: string; keys: string[] }> = [
  {
    group: 'WhatsApp / Meta (legacy single-tenant)',
    keys: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN'],
  },
  {
    group: 'OpenRouter / LLM',
    keys: ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'OPENROUTER_FALLBACK_MODELS', 'GROQ_API_KEY', 'GROQ_MODEL'],
  },
  {
    group: 'Supabase',
    keys: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
  },
  {
    group: 'MySQL CRM',
    keys: ['CRM_MYSQL_HOST', 'CRM_MYSQL_PORT', 'CRM_MYSQL_USER', 'CRM_MYSQL_PASSWORD', 'CRM_MYSQL_DATABASE'],
  },
  {
    group: 'CRM pipeline routing',
    keys: ['CRM_DEFAULT_INITIAL_STAGE_ID', 'CRM_PIPELINE_TBS_ID', 'CRM_PIPELINE_TBS_INITIAL_STAGE_ID'],
  },
  {
    group: 'App',
    keys: ['NEXT_PUBLIC_APP_URL'],
  },
];

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

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Env vars — presence only.
  const envGroups = ENV_GROUPS.map((g) => ({
    group: g.group,
    keys: g.keys.map((k) => ({ key: k, set: !!process.env[k] })),
  }));

  // Supabase round-trip: cheap select on a tiny table.
  let supabaseStatus: { ok: boolean; latencyMs: number; error: string | null } = {
    ok: false, latencyMs: 0, error: null,
  };
  try {
    const t0 = Date.now();
    const supabase = createServerClient();
    const { error } = await supabase.from('users').select('id', { count: 'exact', head: true });
    supabaseStatus = {
      ok: !error,
      latencyMs: Date.now() - t0,
      error: error?.message ?? null,
    };
  } catch (err) {
    supabaseStatus = {
      ok: false,
      latencyMs: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  // MySQL CRM round-trip: SELECT 1.
  let crmStatus: { ok: boolean; latencyMs: number; error: string | null } = {
    ok: false, latencyMs: 0, error: null,
  };
  try {
    const t0 = Date.now();
    await queryCRM('SELECT 1 AS ok');
    crmStatus = { ok: true, latencyMs: Date.now() - t0, error: null };
  } catch (err) {
    crmStatus = {
      ok: false,
      latencyMs: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  return NextResponse.json({
    env: envGroups,
    supabase: supabaseStatus,
    crm: crmStatus,
    runtime: {
      node: process.version,
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
      region: process.env.VERCEL_REGION ?? null,
    },
  });
}
