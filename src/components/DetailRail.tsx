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
    case 'CRM_STAGE_CHANGED': {
      const from = e.metadata?.from_stage_name ?? '—';
      const to = e.metadata?.to_stage_name ?? '—';
      const via = e.metadata?.source === 'crm-sync' ? 'CRM' : actor;
      return `${via} moved stage: ${from} → ${to}`;
    }
    case 'CRM_DEAL_DELETED':
      return `Deal #${e.metadata?.deal_id ?? '?'} deleted in CRM`;
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

interface TaxonomyEntry { name: string; display_name: string; color: string | null }

export default function DetailRail({ conversation, open, onClose, onConversationUpdate }: DetailRailProps) {
  const [notesDraft, setNotesDraft] = useState(conversation.contact_notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [taxonomy, setTaxonomy] = useState<TaxonomyEntry[]>([]);
  const [events, setEvents] = useState<ConversationEvent[]>([]);
  const [refreshingStage, setRefreshingStage] = useState(false);
  const [stages, setStages] = useState<Array<{ id: number; name: string }> | null>(null);
  const [updatingStage, setUpdatingStage] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load tag taxonomy once when the rail opens. Cheap query (~tens of rows
  // max in a normal team) so we don't bother caching across rails.
  useEffect(() => {
    if (!open) return;
    fetch('/api/tags')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: TaxonomyEntry[]) => setTaxonomy(data))
      .catch(() => {});
  }, [open]);

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

  // Load the deal's pipeline stages once when the CRM section becomes
  // visible, so the dropdown has the full list ready. Re-fetches when
  // the conversation changes, or when push state changes (e.g. cron just
  // marked a deal deleted → next open of a freshly-pushed conversation
  // should fetch fresh stages).
  useEffect(() => {
    setStages(null);
    setStageError(null);
    if (!open || !conversation.pushed_to_crm) return;
    let cancelled = false;
    fetch(`/api/conversations/${conversation.id}/crm-stages`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.stages) setStages(data.stages);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, conversation.id, conversation.pushed_to_crm]);

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

  function addTag(rawValue?: string) {
    // Normalize identically to the API so the optimistic UI matches what gets
    // persisted (#VIP / #vip / #Vip → "vip").
    const t = (rawValue ?? tagInput).trim().toLowerCase().replace(/^#/, '');
    if (!t) return;
    const current = conversation.tags ?? [];
    if (current.includes(t)) { setTagInput(''); return; }
    setTags([...current, t]);
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags((conversation.tags ?? []).filter((t) => t !== tag));
  }

  async function refreshStage() {
    if (refreshingStage) return;
    setRefreshingStage(true);
    try {
      await fetch(`/api/conversations/refresh-stages?conversation_id=${conversation.id}`, {
        method: 'POST',
      });
      const r = await fetch(`/api/conversations/${conversation.id}`);
      if (r.ok) {
        const fresh = await r.json();
        onConversationUpdate({ ...conversation, ...fresh });
      }
    } finally {
      setRefreshingStage(false);
    }
  }

  async function changeStage(stageId: number) {
    if (updatingStage || stageId === conversation.crm_stage_id) return;
    setStageError(null);
    setUpdatingStage(true);
    // Optimistic — flip the dropdown immediately so the RM sees their pick
    // without waiting for the round-trip. Realtime will reconcile if the
    // server response disagrees.
    const prevId = conversation.crm_stage_id;
    const prevName = conversation.crm_stage_name;
    const newName = stages?.find((s) => s.id === stageId)?.name ?? null;
    onConversationUpdate({ ...conversation, crm_stage_id: stageId, crm_stage_name: newName });
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/crm-stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: stageId }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Roll back optimistic update.
        onConversationUpdate({ ...conversation, crm_stage_id: prevId, crm_stage_name: prevName });
        setStageError(data?.error ?? 'Could not update stage');
        return;
      }
      onConversationUpdate({
        ...conversation,
        crm_stage_id: data.crm_stage_id,
        crm_stage_name: data.crm_stage_name,
      });
    } catch {
      onConversationUpdate({ ...conversation, crm_stage_id: prevId, crm_stage_name: prevName });
      setStageError('Network error');
    } finally {
      setUpdatingStage(false);
    }
  }

  if (!open) return null;

  const siblings = conversation.sibling_conversations ?? [];

  return (
    <>
      {/* Backdrop — only visible on mobile, lets users tap-to-close. md:hidden
          keeps the desktop layout unchanged. */}
      <div
        onClick={onClose}
        aria-hidden
        className="md:hidden fixed inset-0 bg-black/50 z-40"
      />

      <aside
        role="dialog"
        aria-label="Conversation details"
        className="
          fixed inset-y-0 right-0 z-50 w-[85vw] max-w-sm shadow-2xl
          md:static md:w-80 md:max-w-none md:shadow-none md:z-auto
          border-l border-border-default bg-elevated overflow-y-auto flex-shrink-0
        "
      >
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
          {(conversation.tags ?? []).map((t) => {
            const entry = taxonomy.find((x) => x.name === t);
            const display = entry?.display_name ?? t;
            const color = entry?.color ?? null;
            return (
              <span
                key={t}
                style={color ? { backgroundColor: `${color}22`, borderColor: `${color}55`, color } : undefined}
                className={`inline-flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 border ${color ? '' : 'text-text-default bg-canvas border-border-default'}`}
                title={t === display ? undefined : `Canonical: ${t}`}
              >
                {display}
                <button onClick={() => removeTag(t)} className="opacity-70 hover:opacity-100 leading-none">×</button>
              </span>
            );
          })}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            list={`tag-taxonomy-${conversation.id}`}
            placeholder="+ add"
            className="text-[11px] px-1.5 py-0.5 border-0 outline-none w-24 bg-transparent text-text-default placeholder:text-text-muted"
          />
          {/* Native datalist gives us autocomplete + free-typing in one input
              without pulling in a dropdown library. Agents can pick from the
              taxonomy or type anything; the API normalizes on save. */}
          <datalist id={`tag-taxonomy-${conversation.id}`}>
            {taxonomy.map((t) => (
              <option key={t.name} value={t.display_name} />
            ))}
          </datalist>
        </div>
        {taxonomy.length === 0 && (
          <p className="text-[10px] text-text-muted mt-1.5">
            No tags defined yet. Admins can set up the master list in /admin → Tags.
          </p>
        )}
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
          <div className="flex items-baseline justify-between gap-3 py-1">
            <span className="text-xs text-text-secondary">Stage</span>
            {stages && stages.length > 0 ? (
              <select
                value={conversation.crm_stage_id ?? ''}
                onChange={(e) => changeStage(parseInt(e.target.value, 10))}
                disabled={updatingStage}
                className="text-xs bg-canvas border border-border-default rounded px-1.5 py-1 max-w-[60%] text-text-default focus:outline-none focus:border-border-strong disabled:opacity-50"
              >
                {/* If the current stage isn't in the dropdown (e.g. the CRM
                    deactivated it), surface it as a disabled option so the
                    RM still sees what they're on. */}
                {!stages.some((s) => s.id === conversation.crm_stage_id) && conversation.crm_stage_id != null && (
                  <option value={conversation.crm_stage_id} disabled>
                    {conversation.crm_stage_name ?? `#${conversation.crm_stage_id}`} (unavailable)
                  </option>
                )}
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            ) : (
              <span className={`text-xs ${conversation.crm_stage_name ? 'text-text-default font-medium' : 'text-text-disabled'}`}>
                {conversation.crm_stage_name ?? '—'}
              </span>
            )}
          </div>
          {stageError && (
            <p className="text-[11px] text-danger mt-1">{stageError}</p>
          )}
          <div className="pt-1.5 flex items-center gap-2 flex-wrap">
            <button
              onClick={refreshStage}
              disabled={refreshingStage}
              className="text-[11px] text-text-secondary hover:text-text-default disabled:opacity-50"
            >
              {refreshingStage ? 'Refreshing…' : 'Refresh from CRM'}
            </button>
            <span className="text-[10px] text-text-muted">Auto-syncs every 5 min</span>
          </div>
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
    </>
  );
}
