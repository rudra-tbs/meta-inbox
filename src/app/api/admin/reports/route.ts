export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';
import { queryCRM } from '@/lib/mysql-crm';

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

interface ConvRow {
  id: string;
  brand: string;
  status: string;
  mode: string;
  pushed_to_crm: boolean;
  pushed_to_crm_at: string | null;
  pushed_by_user_id: string | null;
  assigned_to: string | null;
  first_contact_at: string;
  last_human_message_at: string | null;
}

interface MsgRow {
  conversation_id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  sender: 'LEAD' | 'AI' | 'HUMAN';
  sender_user_id: string | null;
  created_at: string;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

// GET /api/admin/reports?days=30&brand=<id>&agent=<userId>
// Returns aggregated metrics across the window. Admin-only. All percentiles
// are computed in JS — Supabase's REST API doesn't expose PERCENTILE_CONT,
// and pulling a few hundred rows is cheap enough that an RPC isn't worth it.
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '30') || 30, 1), 90);
  const brandFilter = searchParams.get('brand');
  const agentFilter = searchParams.get('agent');

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  const supabase = createServerClient();

  // 1. Conversations created in window. Status/mode/pushed flags drive most
  // top-line numbers without touching messages.
  let convQuery = supabase
    .from('conversations')
    .select('id, brand, status, mode, pushed_to_crm, pushed_to_crm_at, pushed_by_user_id, assigned_to, first_contact_at, last_human_message_at')
    .gte('first_contact_at', from.toISOString())
    .lte('first_contact_at', to.toISOString());

  if (brandFilter) convQuery = convQuery.eq('brand', brandFilter);
  if (agentFilter) convQuery = convQuery.eq('assigned_to', agentFilter);

  const { data: convs, error: convErr } = await convQuery;
  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });
  const conversations = (convs ?? []) as ConvRow[];

  // 2. Messages for response-time computation. Cap at 10k rows — sufficient
  // for the volume this app handles; admins hitting that ceiling will see
  // it in the response and can narrow the window.
  const convIds = conversations.map((c) => c.id);
  let messages: MsgRow[] = [];
  let messagesCapped = false;
  if (convIds.length > 0) {
    const { data: msgs, error: msgErr } = await supabase
      .from('messages')
      .select('conversation_id, direction, sender, sender_user_id, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: true })
      .limit(10000);
    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });
    messages = (msgs ?? []) as MsgRow[];
    messagesCapped = messages.length === 10000;
  }

  // 3. Group messages per conversation; compute first inbound + first AI
  // reply + first human reply.
  type ConvTimes = {
    firstInbound: number | null;
    firstAIReply: number | null;
    firstHumanReply: number | null;
    humanRepliesByUser: Map<string, number>;
  };
  const timesByConv = new Map<string, ConvTimes>();
  for (const id of convIds) {
    timesByConv.set(id, { firstInbound: null, firstAIReply: null, firstHumanReply: null, humanRepliesByUser: new Map() });
  }
  for (const m of messages) {
    const t = new Date(m.created_at).getTime();
    const ct = timesByConv.get(m.conversation_id);
    if (!ct) continue;
    if (m.direction === 'INBOUND' && ct.firstInbound === null) ct.firstInbound = t;
    if (m.sender === 'AI' && ct.firstAIReply === null) ct.firstAIReply = t;
    if (m.sender === 'HUMAN') {
      if (ct.firstHumanReply === null) ct.firstHumanReply = t;
      if (m.sender_user_id) {
        ct.humanRepliesByUser.set(m.sender_user_id, (ct.humanRepliesByUser.get(m.sender_user_id) ?? 0) + 1);
      }
    }
  }

  // 4. Aggregate response-time arrays (ms) for AI and human first replies.
  const aiResponseMs: number[] = [];
  const humanResponseMs: number[] = [];
  Array.from(timesByConv.values()).forEach((ct) => {
    if (ct.firstInbound !== null) {
      if (ct.firstAIReply !== null && ct.firstAIReply >= ct.firstInbound) {
        aiResponseMs.push(ct.firstAIReply - ct.firstInbound);
      }
      if (ct.firstHumanReply !== null && ct.firstHumanReply >= ct.firstInbound) {
        humanResponseMs.push(ct.firstHumanReply - ct.firstInbound);
      }
    }
  });
  aiResponseMs.sort((a, b) => a - b);
  humanResponseMs.sort((a, b) => a - b);

  // 5. Top-line totals.
  const total = conversations.length;
  const qualified = conversations.filter((c) => c.status === 'QUALIFIED').length;
  const pushed = conversations.filter((c) => c.pushed_to_crm).length;
  const handed = conversations.filter((c) => c.last_human_message_at != null).length;
  const aiOnly = conversations.filter((c) => c.last_human_message_at == null && c.status !== 'CLOSED').length;

  // 6. Per-brand breakdown.
  const byBrandMap = new Map<string, { brand: string; total: number; qualified: number; pushed: number; handed: number }>();
  for (const c of conversations) {
    const row = byBrandMap.get(c.brand) ?? { brand: c.brand, total: 0, qualified: 0, pushed: 0, handed: 0 };
    row.total += 1;
    if (c.status === 'QUALIFIED') row.qualified += 1;
    if (c.pushed_to_crm) row.pushed += 1;
    if (c.last_human_message_at != null) row.handed += 1;
    byBrandMap.set(c.brand, row);
  }

  // Resolve brand names via CRM pipelines lookup (same pattern as /api/brands).
  const numericBrands = Array.from(byBrandMap.keys()).filter((b) => /^\d+$/.test(b)).map((b) => parseInt(b));
  const brandNames = new Map<string, string>();
  if (numericBrands.length > 0) {
    try {
      const rows = await queryCRM<Array<{ id: number; name: string }>>(
        `SELECT id, name FROM pipelines WHERE id IN (${numericBrands.join(',')})`,
      );
      for (const r of rows) brandNames.set(String(r.id), r.name);
    } catch (err) {
      console.warn('[api/admin/reports] CRM pipeline lookup failed:', err);
    }
  }
  const byBrand = Array.from(byBrandMap.values())
    .map((r) => ({ ...r, name: brandNames.get(r.brand) ?? r.brand }))
    .sort((a, b) => b.total - a.total);

  // 7. Per-agent breakdown. Counts: human replies (any), conversations they
  // were assigned, conversations they pushed to CRM.
  const byAgentMap = new Map<string, { user_id: string; human_replies: number; assigned: number; pushed: number }>();
  function bumpAgent(userId: string, key: 'human_replies' | 'assigned' | 'pushed', delta = 1) {
    const row = byAgentMap.get(userId) ?? { user_id: userId, human_replies: 0, assigned: 0, pushed: 0 };
    row[key] += delta;
    byAgentMap.set(userId, row);
  }
  Array.from(timesByConv.values()).forEach((ct) => {
    Array.from(ct.humanRepliesByUser.entries()).forEach(([uid, n]) => bumpAgent(uid, 'human_replies', n));
  });
  for (const c of conversations) {
    if (c.assigned_to) bumpAgent(c.assigned_to, 'assigned');
    if (c.pushed_to_crm && c.pushed_by_user_id) bumpAgent(c.pushed_by_user_id, 'pushed');
  }
  // Resolve user names.
  const agentIds = Array.from(byAgentMap.keys());
  const userNames = new Map<string, string>();
  if (agentIds.length > 0) {
    const { data: users } = await supabase.from('users').select('id, name').in('id', agentIds);
    for (const u of users ?? []) userNames.set(u.id as string, u.name as string);
  }
  const byAgent = Array.from(byAgentMap.values())
    .map((r) => ({ ...r, name: userNames.get(r.user_id) ?? r.user_id }))
    .sort((a, b) => b.human_replies - a.human_replies);

  // 8. Daily volume — bucket by yyyy-mm-dd in UTC.
  const dailyMap = new Map<string, { date: string; total: number; qualified: number; pushed: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime() + i * 86400000);
    const key = d.toISOString().slice(0, 10);
    dailyMap.set(key, { date: key, total: 0, qualified: 0, pushed: 0 });
  }
  for (const c of conversations) {
    const key = c.first_contact_at.slice(0, 10);
    const row = dailyMap.get(key);
    if (!row) continue;
    row.total += 1;
    if (c.status === 'QUALIFIED') row.qualified += 1;
    if (c.pushed_to_crm) row.pushed += 1;
  }
  const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    window: { from: from.toISOString(), to: to.toISOString(), days },
    filters: { brand: brandFilter, agent: agentFilter },
    totals: {
      conversations: total,
      qualified,
      pushed_to_crm: pushed,
      handed_off: handed,
      ai_only: aiOnly,
    },
    rates: {
      qualification: total > 0 ? qualified / total : 0,
      handoff: total > 0 ? handed / total : 0,
      crm_push_of_qualified: qualified > 0 ? pushed / qualified : 0,
    },
    response_time: {
      ai:    { sample: aiResponseMs.length,    p50_ms: percentile(aiResponseMs, 50),    p95_ms: percentile(aiResponseMs, 95)    },
      human: { sample: humanResponseMs.length, p50_ms: percentile(humanResponseMs, 50), p95_ms: percentile(humanResponseMs, 95) },
    },
    daily,
    by_brand: byBrand,
    by_agent: byAgent,
    notes: messagesCapped ? ['Messages query was capped at 10k rows; narrow the window or filter by brand/agent for full accuracy.'] : [],
  });
}
