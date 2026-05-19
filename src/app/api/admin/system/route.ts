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
    group: 'LLM (Groq)',
    keys: ['GROQ_API_KEY', 'GROQ_MODEL', 'GROQ_FALLBACK_MODELS'],
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
    keys: ['CRM_DEFAULT_INITIAL_STAGE_ID'],
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

  // Migration checks. The webhook depends on schema + RPCs that ship through
  // migrations/*.sql — surfacing them here lets the admin spot a missed
  // migration before the inbox starts misbehaving silently.
  const migrationChecks = await runMigrationChecks();

  // Recent message send failures. Useful when an admin reports "messages
  // aren't going out" — show them the actual error from Meta instead of
  // making them dig through logs.
  const recentFailures = await fetchRecentSendFailures();

  return NextResponse.json({
    env: envGroups,
    supabase: supabaseStatus,
    crm: crmStatus,
    migrations: migrationChecks,
    recent_send_failures: recentFailures,
    runtime: {
      node: process.version,
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
      region: process.env.VERCEL_REGION ?? null,
    },
  });
}

interface RecentFailure {
  id: string;
  conversation_id: string;
  content: string;
  send_error: string | null;
  sender: string;
  created_at: string;
}

async function fetchRecentSendFailures(): Promise<RecentFailure[]> {
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('messages')
      .select('id, conversation_id, content, send_error, sender, created_at')
      .eq('delivered_status', 'FAILED')
      .order('created_at', { ascending: false })
      .limit(15);
    return (data ?? []) as RecentFailure[];
  } catch (err) {
    console.warn('[admin/system] recent send failures probe failed:', err);
    return [];
  }
}

interface MigrationCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string | null;
}

async function runMigrationChecks(): Promise<MigrationCheck[]> {
  const supabase = createServerClient();
  const checks: MigrationCheck[] = [];

  // 1. increment_unread RPC — used by the webhook to bump unread atomically.
  // We call it with a UUID that doesn't exist. If the function is missing,
  // PostgREST returns a "Could not find the function" error; if it's there,
  // the underlying UPDATE no-ops and we get a clean success.
  try {
    const probeId = '00000000-0000-0000-0000-000000000000';
    const { error } = await supabase.rpc('increment_unread', { conv_id: probeId });
    if (error) {
      const msg = error.message ?? '';
      const missing = /Could not find the function|function .* does not exist/i.test(msg);
      checks.push({
        key: 'rpc_increment_unread',
        label: 'RPC increment_unread (atomic unread bump)',
        ok: !missing,
        detail: missing ? 'Missing — run migrations/2026_05_hardening.sql' : msg,
      });
    } else {
      checks.push({
        key: 'rpc_increment_unread',
        label: 'RPC increment_unread (atomic unread bump)',
        ok: true,
        detail: null,
      });
    }
  } catch (err) {
    checks.push({
      key: 'rpc_increment_unread',
      label: 'RPC increment_unread (atomic unread bump)',
      ok: false,
      detail: err instanceof Error ? err.message : 'probe failed',
    });
  }

  // 2. unread_count column — webhook also depends on this. Probe by selecting
  // the column; supabase-js returns an error referencing the column name when
  // it's missing.
  try {
    const { error } = await supabase
      .from('conversations')
      .select('unread_count', { count: 'exact', head: true });
    const missing = !!error && /unread_count/i.test(error.message ?? '');
    checks.push({
      key: 'col_unread_count',
      label: 'conversations.unread_count column',
      ok: !error,
      detail: missing
        ? 'Missing — run migrations/add_unread_count.sql'
        : error?.message ?? null,
    });
  } catch (err) {
    checks.push({
      key: 'col_unread_count',
      label: 'conversations.unread_count column',
      ok: false,
      detail: err instanceof Error ? err.message : 'probe failed',
    });
  }

  // 3. delivered_status column — used by the reply route and AI handler.
  try {
    const { error } = await supabase
      .from('messages')
      .select('delivered_status', { count: 'exact', head: true });
    const missing = !!error && /delivered_status/i.test(error.message ?? '');
    checks.push({
      key: 'col_delivered_status',
      label: 'messages.delivered_status column',
      ok: !error,
      detail: missing
        ? 'Missing — run migrations/2026_05_hardening.sql'
        : error?.message ?? null,
    });
  } catch (err) {
    checks.push({
      key: 'col_delivered_status',
      label: 'messages.delivered_status column',
      ok: false,
      detail: err instanceof Error ? err.message : 'probe failed',
    });
  }

  // 4. users.active column — needed for the deactivate flow.
  try {
    const { error } = await supabase
      .from('users')
      .select('active', { count: 'exact', head: true });
    const missing = !!error && /active/i.test(error.message ?? '');
    checks.push({
      key: 'col_users_active',
      label: 'users.active column (deactivation)',
      ok: !error,
      detail: missing
        ? 'Missing — run migrations/2026_05_admin_panel.sql'
        : error?.message ?? null,
    });
  } catch (err) {
    checks.push({
      key: 'col_users_active',
      label: 'users.active column (deactivation)',
      ok: false,
      detail: err instanceof Error ? err.message : 'probe failed',
    });
  }

  // 5. ai_abstained column — controls the distinct "AI handed off" indicator.
  try {
    const { error } = await supabase
      .from('conversations')
      .select('ai_abstained', { count: 'exact', head: true });
    const missing = !!error && /ai_abstained/i.test(error.message ?? '');
    checks.push({
      key: 'col_ai_abstained',
      label: 'conversations.ai_abstained column',
      ok: !error,
      detail: missing
        ? 'Missing — run migrations/2026_05_ai_abstained.sql'
        : error?.message ?? null,
    });
  } catch (err) {
    checks.push({
      key: 'col_ai_abstained',
      label: 'conversations.ai_abstained column',
      ok: false,
      detail: err instanceof Error ? err.message : 'probe failed',
    });
  }

  // 6. admin_events table — drives the admin audit log.
  try {
    const { error } = await supabase
      .from('admin_events')
      .select('id', { count: 'exact', head: true });
    const missing = !!error && /relation "?admin_events"? does not exist/i.test(error.message ?? '');
    checks.push({
      key: 'table_admin_events',
      label: 'admin_events table (audit log)',
      ok: !error,
      detail: missing
        ? 'Missing — run migrations/2026_05_admin_events.sql'
        : error?.message ?? null,
    });
  } catch (err) {
    checks.push({
      key: 'table_admin_events',
      label: 'admin_events table (audit log)',
      ok: false,
      detail: err instanceof Error ? err.message : 'probe failed',
    });
  }

  // 7. brand_pipelines table — backs the brand→pipeline mapping UI.
  try {
    const { error } = await supabase
      .from('brand_pipelines')
      .select('brand', { count: 'exact', head: true });
    const missing = !!error && /relation "?brand_pipelines"? does not exist/i.test(error.message ?? '');
    checks.push({
      key: 'table_brand_pipelines',
      label: 'brand_pipelines table (admin pipeline mapping)',
      ok: !error,
      detail: missing
        ? 'Missing — run migrations/2026_05_brand_pipelines.sql'
        : error?.message ?? null,
    });
  } catch (err) {
    checks.push({
      key: 'table_brand_pipelines',
      label: 'brand_pipelines table (admin pipeline mapping)',
      ok: false,
      detail: err instanceof Error ? err.message : 'probe failed',
    });
  }

  // 8. brand_settings table — backs per-brand default conversation mode.
  try {
    const { error } = await supabase
      .from('brand_settings')
      .select('brand', { count: 'exact', head: true });
    const missing = !!error && /relation "?brand_settings"? does not exist/i.test(error.message ?? '');
    checks.push({
      key: 'table_brand_settings',
      label: 'brand_settings table (per-brand default mode)',
      ok: !error,
      detail: missing
        ? 'Missing — run migrations/2026_05_brand_settings.sql'
        : error?.message ?? null,
    });
  } catch (err) {
    checks.push({
      key: 'table_brand_settings',
      label: 'brand_settings table (per-brand default mode)',
      ok: false,
      detail: err instanceof Error ? err.message : 'probe failed',
    });
  }

  // 8b. brand_settings.color column — added in a follow-up migration. Probed
  // separately because a project that's run the original brand_settings file
  // may still be missing this one.
  try {
    const { error } = await supabase
      .from('brand_settings')
      .select('color', { count: 'exact', head: true });
    const missing = !!error && /color/i.test(error.message ?? '');
    checks.push({
      key: 'col_brand_settings_color',
      label: 'brand_settings.color column (brand chip color)',
      ok: !error,
      detail: missing
        ? 'Missing — run migrations/2026_05_brand_settings_color_logo.sql'
        : error?.message ?? null,
    });
  } catch (err) {
    checks.push({
      key: 'col_brand_settings_color',
      label: 'brand_settings.color column (brand chip color)',
      ok: false,
      detail: err instanceof Error ? err.message : 'probe failed',
    });
  }

  // 9. tag_taxonomy table — backs the admin-managed tag list.
  try {
    const { error } = await supabase
      .from('tag_taxonomy')
      .select('name', { count: 'exact', head: true });
    const missing = !!error && /relation "?tag_taxonomy"? does not exist/i.test(error.message ?? '');
    checks.push({
      key: 'table_tag_taxonomy',
      label: 'tag_taxonomy table (admin-managed tag list)',
      ok: !error,
      detail: missing
        ? 'Missing — run migrations/2026_05_tag_taxonomy.sql'
        : error?.message ?? null,
    });
  } catch (err) {
    checks.push({
      key: 'table_tag_taxonomy',
      label: 'tag_taxonomy table (admin-managed tag list)',
      ok: false,
      detail: err instanceof Error ? err.message : 'probe failed',
    });
  }

  return checks;
}
