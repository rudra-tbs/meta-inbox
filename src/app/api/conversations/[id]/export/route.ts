export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient as createSupabaseSSR } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { getUserByAuthId } from '@/lib/auth';

// GET /api/conversations/[id]/export
//
// Returns the full conversation rendered as Markdown, suitable for
// handing off to a planner who doesn't have inbox access — they can
// paste it into a doc, search it, copy bits out. PDF is intentionally
// out of scope (use the browser's Print → Save as PDF on the returned
// markdown if you really need that format).
//
// Includes:
//   - Conversation metadata (contact, brand, mode, dates, assignee)
//   - Lead snapshot (qualification fields from the joined contact)
//   - CRM linkage (deal id, stage, pushed-by, pushed-at)
//   - Full message log in chronological order with sender labels
//   - Activity event log
//
// Content-Disposition: attachment so the browser triggers a download
// directly. Filename pattern: <contact-name>-<short-id>.md.

interface MessageRow {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  sender: 'LEAD' | 'AI' | 'HUMAN';
  content: string;
  created_at: string;
  delivered_status?: string | null;
  send_error?: string | null;
  // Joined sender name when sender_user_id present.
  sender_user?: { name: string } | null;
}

interface EventRow {
  id: string;
  event_type: string;
  actor_name: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any> | null;
  created_at: string;
}

function formatLocal(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function senderLabel(m: MessageRow): string {
  if (m.sender === 'LEAD') return 'Lead';
  if (m.sender === 'AI') return '✨ AI';
  return m.sender_user?.name ? `Agent (${m.sender_user.name})` : 'Agent';
}

function escapeMd(s: string | null | undefined): string {
  if (!s) return '';
  // Soft escape for the common breakers — newlines we want preserved.
  return s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function eventLine(e: EventRow): string {
  const when = formatLocal(e.created_at);
  const actor = e.actor_name ?? 'system';
  const m = e.metadata ?? {};
  switch (e.event_type) {
    case 'MODE_CHANGED':
      return `${when} — ${actor} switched mode to ${m.to ?? '?'}`;
    case 'ASSIGNED':
      return `${when} — ${actor} ${m.assigned_to ? `assigned to ${m.assigned_name ?? 'agent'}` : 'unassigned'}`;
    case 'PUSHED_TO_CRM':
      return `${when} — ${actor} pushed to CRM (Deal #${m.deal_id ?? '?'})`;
    case 'SNOOZED':
      return `${when} — ${actor} snoozed until ${m.until ? formatLocal(m.until) : '—'}`;
    case 'UNSNOOZED':
      return `${when} — ${actor} unsnoozed`;
    case 'TAG_ADDED':
      return `${when} — ${actor} updated tags: ${(m.tags ?? []).join(', ') || '—'}`;
    case 'NOTE_UPDATED':
      return `${when} — ${actor} updated notes`;
    case 'ABSTAIN':
      return `${when} — AI abstained, escalated to human`;
    case 'CALLBACK_DETECTED':
      return `${when} — AI flagged a callback`;
    case 'CONTACT_MERGED':
      return `${when} — Contacts merged`;
    case 'CRM_STAGE_CHANGED': {
      const from = m.from_stage_name ?? '—';
      const to = m.to_stage_name ?? '—';
      const via = m.source === 'crm-sync' ? 'CRM' : actor;
      return `${when} — ${via} moved stage: ${from} → ${to}`;
    }
    case 'CRM_DEAL_DELETED':
      return `${when} — Deal #${m.deal_id ?? '?'} deleted in CRM (${m.mode ?? 'soft_delete'})`;
    default:
      return `${when} — ${actor} · ${e.event_type}`;
  }
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
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
  const appUser = await getUserByAuthId(user.id);
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServerClient();

  // Single conversation row + joined contact (for qualification fields)
  // + assigned user (for display name). The columns mirror what the
  // inbox UI shows, so the export looks like the on-screen rail.
  const { data: convRaw, error: convErr } = await supabase
    .from('conversations')
    .select(`
      id, brand, channel, phone_number, contact_name, mode, status,
      first_contact_at, last_message_at, last_human_message_at,
      assigned_to, instagram_id,
      pushed_to_crm, crm_deal_id, crm_stage_id, crm_stage_name,
      pushed_to_crm_at, pushed_by_user_id,
      contact:contacts!contact_id(name, city, wedding_date, guest_count, budget_range, service_type, notes),
      assigned_user:users!assigned_to(name)
    `)
    .eq('id', params.id)
    .single();

  if (convErr || !convRaw) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conv = convRaw as any;

  const [{ data: messagesRaw }, { data: eventsRaw }] = await Promise.all([
    supabase
      .from('messages')
      .select('id, direction, sender, content, created_at, delivered_status, send_error, sender_user:users!sender_user_id(name)')
      .eq('conversation_id', params.id)
      .order('created_at', { ascending: true })
      .limit(2000),
    supabase
      .from('conversation_events')
      .select('id, event_type, actor_name, metadata, created_at')
      .eq('conversation_id', params.id)
      .order('created_at', { ascending: true })
      .limit(500),
  ]);

  const messages = (messagesRaw ?? []) as unknown as MessageRow[];
  const events = (eventsRaw ?? []) as unknown as EventRow[];

  const displayName = conv.contact?.name ?? conv.contact_name ?? `+${conv.phone_number}`;
  const channelLabel = conv.channel === 'IG' ? 'Instagram' : 'WhatsApp';
  const identifierLine = [
    conv.phone_number ? `+${conv.phone_number}` : null,
    conv.instagram_id ? `@${conv.instagram_id}` : null,
  ].filter(Boolean).join(' · ');

  const lines: string[] = [];

  // Header.
  lines.push(`# Conversation with ${escapeMd(displayName)}`);
  lines.push('');
  lines.push(`${identifierLine || '—'} · ${escapeMd(String(conv.brand))} · ${channelLabel}`);
  lines.push('');

  // Metadata block.
  lines.push(`**Status:** ${conv.status}`);
  lines.push(`**Mode:** ${conv.mode}`);
  lines.push(`**First contact:** ${formatLocal(conv.first_contact_at)}`);
  lines.push(`**Last message:** ${formatLocal(conv.last_message_at)}`);
  lines.push(`**Last human reply:** ${formatLocal(conv.last_human_message_at)}`);
  lines.push(`**Assigned to:** ${conv.assigned_user?.name ?? 'Unassigned'}`);
  lines.push('');

  // Lead snapshot.
  const lead = conv.contact ?? {};
  lines.push('## Lead');
  lines.push(`- **City:** ${escapeMd(lead.city) || '—'}`);
  lines.push(`- **Wedding date:** ${escapeMd(lead.wedding_date) || '—'}`);
  lines.push(`- **Guests:** ${escapeMd(lead.guest_count) || '—'}`);
  lines.push(`- **Budget:** ${escapeMd(lead.budget_range) || '—'}`);
  lines.push(`- **Service:** ${escapeMd(lead.service_type) || '—'}`);
  if (lead.notes) {
    lines.push('');
    lines.push('### Internal notes');
    lines.push(escapeMd(lead.notes));
  }
  lines.push('');

  // CRM linkage (only if pushed).
  if (conv.pushed_to_crm) {
    lines.push('## CRM');
    lines.push(`- **Deal:** #${conv.crm_deal_id ?? '?'}`);
    if (conv.crm_stage_name) lines.push(`- **Stage:** ${escapeMd(conv.crm_stage_name)}`);
    if (conv.pushed_to_crm_at) lines.push(`- **Pushed:** ${formatLocal(conv.pushed_to_crm_at)}`);
    lines.push('');
  }

  // Messages.
  lines.push('## Messages');
  lines.push('');
  if (messages.length === 0) {
    lines.push('_No messages._');
  } else {
    for (const m of messages) {
      const sender = senderLabel(m);
      const when = formatLocal(m.created_at);
      const failed = m.delivered_status === 'FAILED' ? ' · _failed to send_' : '';
      lines.push(`**${sender}** · ${when}${failed}`);
      // Indent message content as a blockquote so multi-line replies
      // render as one unit when pasted into a doc.
      const body = (m.content ?? '').split(/\r?\n/).map((l) => `> ${l}`).join('\n');
      lines.push(body || '> _(empty)_');
      lines.push('');
    }
  }

  // Activity log.
  if (events.length > 0) {
    lines.push('## Activity log');
    lines.push('');
    for (const e of events) {
      lines.push(`- ${eventLine(e)}`);
    }
    lines.push('');
  }

  // Footer.
  lines.push('---');
  lines.push(`_Exported ${formatLocal(new Date().toISOString())} by ${appUser.name} from Acceltancy Inbox._`);

  const markdown = lines.join('\n');

  // Filename: contact name (slugified) + first 8 chars of the
  // conversation id so multiple exports from the same contact stay
  // distinguishable.
  const slug = (displayName || 'conversation')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'conversation';
  const filename = `${slug}-${conv.id.slice(0, 8)}.md`;

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
