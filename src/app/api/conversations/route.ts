export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId, getConversationFilter } from '@/lib/auth';
import { computeLeadScore } from '@/lib/lead-score';

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const brand = searchParams.get('brand') || 'TBS';
  const channel = searchParams.get('channel') || 'WA';
  const includeAllChannels = channel === 'ALL';
  const mode = searchParams.get('mode');
  const status = searchParams.get('status');
  const mine = searchParams.get('mine') === 'true';
  const pending = searchParams.get('pending') === 'true';
  const snoozed = searchParams.get('snoozed') === 'true';
  const tag = searchParams.get('tag');
  const stage = searchParams.get('stage');
  const search = searchParams.get('search');

  const filter = await getConversationFilter(appUser.id);

  let query = supabase
    .from('conversations')
    .select(`
      *,
      contact:contacts(name, phone, instagram_id, city, wedding_date, guest_count, budget_range, service_type, notes),
      assigned_user:users!assigned_to(name)
    `)
    .eq('brand', brand)
    .order('last_message_at', { ascending: false });
  if (!includeAllChannels) query = query.eq('channel', channel);

  // Hide snoozed (whose snooze hasn't expired) unless explicitly requested
  if (snoozed) {
    query = query.not('snoozed_until', 'is', null).gte('snoozed_until', new Date().toISOString());
  } else {
    query = query.or(`snoozed_until.is.null,snoozed_until.lte.${new Date().toISOString()}`);
  }

  if (filter) {
    const allowed = filter.allowedBrandChannels as Array<{ brand: string; channel: string }>;
    const isAllowed = includeAllChannels
      ? allowed.some((a) => a.brand === brand)
      : allowed.some((a) => a.brand === brand && a.channel === channel);
    if (!isAllowed) return NextResponse.json([]);
    query = query.or(`assigned_to.is.null,assigned_to.eq.${filter.userId}`);
  }

  if (mode) query = query.eq('mode', mode);
  if (status) query = query.eq('status', status);
  if (mine) query = query.eq('assigned_to', appUser.id);
  if (pending) query = query.or('needs_human_reply.eq.true,callback_required.eq.true');
  if (stage) query = query.eq('crm_stage_id', parseInt(stage));
  if (tag) query = query.contains('tags', [tag]);
  if (search) {
    // Full-text search across message content + name/phone
    const { data: fts } = await supabase
      .from('messages')
      .select('conversation_id')
      .textSearch('search_vector', search, { type: 'websearch', config: 'english' });
    const ftsIds = Array.from(new Set((fts ?? []).map((m) => m.conversation_id)));
    const idClause = ftsIds.length > 0 ? `,id.in.(${ftsIds.join(',')})` : '';
    query = query.or(
      `contact_name.ilike.%${search}%,phone_number.ilike.%${search}%${idClause}`
    );
  }

  const { data: conversations, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch last message + inbound count per conversation
  const convIds = (conversations ?? []).map((c) => c.id);
  const lastMessages: Record<string, string> = {};
  const inboundCounts: Record<string, number> = {};
  if (convIds.length > 0) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('conversation_id, content, direction, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false });
    if (msgs) {
      for (const m of msgs) {
        if (!lastMessages[m.conversation_id]) {
          lastMessages[m.conversation_id] = m.content;
        }
        if (m.direction === 'INBOUND') {
          inboundCounts[m.conversation_id] = (inboundCounts[m.conversation_id] ?? 0) + 1;
        }
      }
    }
  }

  // Fetch sibling conversations (same contact, other channel)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactIds = (conversations ?? []).map((c: any) => c.contact_id).filter(Boolean);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const siblings: Record<string, Array<{ id: string; channel: string; brand: string }>> = {};
  if (contactIds.length > 0) {
    const { data: allConvs } = await supabase
      .from('conversations')
      .select('id, contact_id, brand, channel')
      .in('contact_id', contactIds);
    if (allConvs) {
      for (const sc of allConvs) {
        if (!convIds.includes(sc.id)) continue; // safety
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const sc of allConvs as any[]) {
        if (!siblings[sc.contact_id]) siblings[sc.contact_id] = [];
        siblings[sc.contact_id].push({ id: sc.id, channel: sc.channel, brand: sc.brand });
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (conversations ?? []).map((c: any) => {
    const contact = c.contact;
    const assignedUser = c.assigned_user;
    const contactSiblings = (siblings[c.contact_id] ?? []).filter((s) => s.id !== c.id);
    return {
      ...c,
      contact: undefined,
      assigned_user: undefined,
      last_message: lastMessages[c.id] ?? null,
      assigned_user_name: assignedUser?.name ?? null,
      // Flatten contact qualification fields onto conversation
      contact_name: contact?.name ?? c.contact_name,
      city: contact?.city ?? c.city,
      wedding_date: contact?.wedding_date ?? c.wedding_date,
      guest_count: contact?.guest_count ?? c.guest_count,
      budget_range: contact?.budget_range ?? c.budget_range,
      service_type: contact?.service_type ?? c.service_type,
      contact_phone: contact?.phone ?? null,
      contact_instagram_id: contact?.instagram_id ?? null,
      contact_notes: contact?.notes ?? null,
      sibling_conversations: contactSiblings,
      lead_score: computeLeadScore({
        budget_range: contact?.budget_range ?? c.budget_range,
        wedding_date: contact?.wedding_date ?? c.wedding_date,
        guest_count: contact?.guest_count ?? c.guest_count,
        service_type: contact?.service_type ?? c.service_type,
        city: contact?.city ?? c.city,
        inbound_count: inboundCounts[c.id] ?? 0,
      }),
    };
  });

  return NextResponse.json(result);
}
