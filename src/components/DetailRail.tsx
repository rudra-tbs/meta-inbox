'use client';

import { useEffect, useRef, useState } from 'react';
import type { Conversation, ConversationEvent } from '@/types';
import Dot from './ui/Dot';

interface DetailRailProps {
  conversation: Conversation;
  open: boolean;
  onClose: () => void;
  onConversationUpdate: (c: Conversation) => void;
}

function eventLabel(e: ConversationEvent): string {
  const actor = e.actor_name ?? 'system';
  switch (e.event_type) {
    case 'MODE_CHANGED': return `${actor} switched mode to ${e.metadata?.to}`;
    case 'ASSIGNED':
      return e.metadata?.assigned_to ? `${actor} assigned to ${e.metadata?.assigned_name ?? 'agent'}` : `${actor} unassigned`;
    case 'PUSHED_TO_CRM': return `${actor} pushed to CRM (Deal #${e.metadata?.deal_id})`;
    case 'SNOOZED': return `${actor} snoozed until ${e.metadata?.until ? new Date(e.metadata.until).toLocaleString('en-IN') : '—'}`;
    case 'UNSNOOZED': return `${actor} unsnoozed`;
    case 'TAG_ADDED': return `${actor} updated tags: ${(e.metadata?.tags ?? []).join(', ') || '—'}`;
    case 'NOTE_UPDATED': return `${actor} updated notes`;
    case 'ABSTAIN': return `AI abstained — escalated to human`;
    case 'CALLBACK_DETECTED': return `AI flagged a callback`;
    case 'CONTACT_MERGED': return `Contacts merged`;
    default: return `${actor} · ${e.event_type}`;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-5 py-4 border-b border-border-subtle">
      <h3 className="text-[10px] uppercase tracking-[0.08em] font-semibold text-text-muted mb-2.5">
        {title}
      </h3>
      <div>{children}</div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className={`text-xs ${value ? 'text-text-default font-medium' : 'text-text-disabled'}`}>
        {value || '—'}
      </span>
    </div>
  );
}

export default function DetailRail({ conversation, open, onClose, onConversationUpdate }: DetailRailProps) {
  const [notesDraft, setNotesDraft] = useState(conversation.contact_notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [events, setEvents] = useState<ConversationEvent[]>([]);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNotesDraft(conversation.contact_notes ?? '');
  }, [conversation.id, conversation.contact_notes]);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/conversations/${conversation.id}/events`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setEvents)
      .catch(() => {});
  }, [open, conversation.id]);

  function saveNotes(value: string) {
    setNotesDraft(value);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      if (!conversation.contact_id) return;
      setSavingNotes(true);
      try {
        await fetch(`/api/contacts/${conversation.contact_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: value }),
        });
        onConversationUpdate({ ...conversation, contact_notes: value });
      } finally {
        setSavingNotes(false);
      }
    }, 600);
  }

  async function setTags(tags: string[]) {
    await fetch(`/api/conversations/${conversation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags }),
    });
    onConversationUpdate({ ...conversation, tags });
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    const current = conversation.tags ?? [];
    if (current.includes(t)) { setTagInput(''); return; }
    setTags([...current, t]);
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags((conversation.tags ?? []).filter((t) => t !== tag));
  }

  if (!open) return null;

  const siblings = conversation.sibling_conversations ?? [];

  return (
    <aside className="w-80 border-l border-border-default bg-elevated overflow-y-auto flex-shrink-0">
      <div className="sticky top-0 bg-elevated/95 backdrop-blur px-5 py-3 border-b border-border-default flex items-center justify-between z-10">
        <h2 className="text-sm font-semibold text-text-primary">Details</h2>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-default w-7 h-7 inline-flex items-center justify-center rounded hover:bg-canvas"
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      {/* Lead snapshot */}
      <Section title="Lead">
        <InfoRow label="City" value={conversation.city} />
        <InfoRow label="Event date" value={conversation.wedding_date} />
        <InfoRow label="Guests" value={conversation.guest_count} />
        <InfoRow label="Budget" value={conversation.budget_range} />
        <InfoRow label="Service" value={conversation.service_type} />
        {(conversation.lead_score ?? 0) > 0 && (
          <div className="flex items-baseline justify-between gap-3 py-1 mt-1 pt-2 border-t border-border-subtle">
            <span className="text-xs text-text-secondary">Lead score</span>
            <span className={`text-xs font-semibold ${
              conversation.lead_score! >= 60 ? 'text-danger' : conversation.lead_score! >= 30 ? 'text-warning' : 'text-text-secondary'
            }`}>
              {conversation.lead_score} / 100
            </span>
          </div>
        )}
      </Section>

      {/* Notes */}
      <Section title={savingNotes ? 'Notes — saving…' : 'Internal notes'}>
        <textarea
          value={notesDraft}
          onChange={(e) => saveNotes(e.target.value)}
          placeholder="Visible to all RMs · never sent to lead"
          rows={3}
          className="w-full text-xs text-text-default bg-canvas border border-border-subtle rounded-md px-2.5 py-2 resize-none focus:outline-none focus:border-border-strong placeholder:text-text-muted"
        />
      </Section>

      {/* Tags */}
      <Section title="Tags">
        <div className="flex flex-wrap gap-1.5 items-center">
          {(conversation.tags ?? []).map((t) => (
            <span key={t} className="inline-flex items-center gap-1 text-[11px] text-text-default bg-canvas border border-border-default rounded px-1.5 py-0.5">
              {t}
              <button onClick={() => removeTag(t)} className="text-text-muted hover:text-danger leading-none">×</button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            placeholder="+ add"
            className="text-[11px] px-1.5 py-0.5 border-0 outline-none w-16 bg-transparent text-text-default placeholder:text-text-muted"
          />
        </div>
      </Section>

      {/* Other channels */}
      {siblings.length > 0 && (
        <Section title="Also on">
          <div className="flex flex-col gap-1">
            {siblings.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-xs text-text-default">
                <Dot tone={s.channel === 'WA' ? 'success' : 'danger'} />
                {s.channel === 'WA' ? 'WhatsApp' : 'Instagram'}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* CRM status */}
      {conversation.pushed_to_crm && (
        <Section title="CRM">
          <InfoRow label="Deal" value={`#${conversation.crm_deal_id}`} />
          <InfoRow label="Stage" value={conversation.crm_stage_name} />
        </Section>
      )}

      {/* Activity */}
      <Section title="Activity">
        {events.length === 0 ? (
          <p className="text-xs text-text-muted">No activity yet</p>
        ) : (
          <ol className="space-y-2.5">
            {events.map((e) => (
              <li key={e.id} className="text-xs">
                <p className="text-text-default leading-snug">{eventLabel(e)}</p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  {new Date(e.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </aside>
  );
}
