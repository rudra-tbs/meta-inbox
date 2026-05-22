'use client';

import { useEffect, useRef, useState } from 'react';
import type { Conversation, ConversationEvent } from '@/types';
import Dot from './ui/Dot';
import { toast } from '@/lib/toast';
import { useFocusTrap } from '@/lib/use-focus-trap';

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

// Inline-editable variant of InfoRow. Click the value (or pencil) to
// switch into an input; Enter to save, Escape to cancel, blur also
// saves. Used for the qualification fields in the Lead section.
function EditableRow({
  label,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  value: string | null;
  placeholder?: string;
  onSave: (next: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value ?? '');
      // Defer focus so the input is mounted before we try to focus it.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing, value]);

  async function commit() {
    const trimmed = draft.trim();
    const next = trimmed === '' ? null : trimmed;
    if (next === (value ?? null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-baseline justify-between gap-3 py-1">
        <span className="text-xs text-text-secondary">{label}</span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
          }}
          onBlur={commit}
          disabled={saving}
          placeholder={placeholder}
          className="flex-1 max-w-[60%] text-xs bg-canvas border border-border-strong rounded px-1.5 py-0.5 text-text-default focus:outline-none focus:ring-2 focus:ring-brand/15"
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-baseline justify-between gap-3 py-1 group cursor-pointer"
      onClick={() => setEditing(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true); }
      }}
    >
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className={`text-xs ${value ? 'text-text-default font-medium' : 'text-text-disabled italic'}`}>
          {value || (placeholder ?? '—')}
        </span>
        <span className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity text-[10px]" aria-hidden>
          ✎
        </span>
      </span>
    </div>
  );
}

// Initials + colored circle used in the activity timeline. The hue is
// hash-derived from the actor name so two events from the same person
// always look the same.
function ActivityAvatar({ name, isSystem }: { name: string; isSystem?: boolean }) {
  if (isSystem) {
    return (
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] flex-shrink-0 bg-elevated border border-border-default text-text-secondary"
        aria-hidden
      >
        ✨
      </span>
    );
  }
  const initials = name.trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || '?';
  // Cheap deterministic hue.
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-semibold text-white flex-shrink-0"
      style={{ backgroundColor: `hsl(${hue}, 55%, 45%)` }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

// Human-readable currency for the stage value chip. ₹ with k/L/Cr
// suffixes — matches what an Indian RM expects to read.
function formatINRShort(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(n % 1_00_00_000 === 0 ? 0 : 1)}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(n % 1_00_000 === 0 ? 0 : 1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return `₹${n}`;
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
  // When the server returns a 400 with `missing` + `ux=modal`, we surface
  // a "missing info" form to the operator. Once filled and submitted we
  // PATCH /crm-deal then retry the stage change with the same target id.
  type MissingField = 'venue' | 'city' | 'value' | 'label';
  const [stageGate, setStageGate] = useState<null | {
    targetStageId: number;
    targetStageName: string;
    missing: MissingField[];
    message: string;
  }>(null);
  // Deal value pulled from CRM via /api/conversations/[id]/crm-stages.
  // Surfaced as a chip next to the stage dropdown.
  const [dealValue, setDealValue] = useState<number | null>(null);
  // Flash highlight on the stage dropdown when crm_stage_id changes
  // out from under us (cron sync, RM in another tab, CRM Dashboard
  // direct edit). Cleared after the animation duration.
  const [stageJustChanged, setStageJustChanged] = useState(false);
  const prevStageIdRef = useRef<number | null>(conversation.crm_stage_id);
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
  // should fetch fresh stages). Same call now returns the live deal
  // value for the chip and the venue/city snapshot for prefill.
  useEffect(() => {
    setStages(null);
    setDealValue(null);
    setStageError(null);
    if (!open || !conversation.pushed_to_crm) return;
    let cancelled = false;
    fetch(`/api/conversations/${conversation.id}/crm-stages`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.stages) setStages(data.stages);
        if (typeof data?.deal?.value === 'number') setDealValue(data.deal.value);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, conversation.id, conversation.pushed_to_crm]);

  // Detect remote stage changes (cron sync, another tab, CRM Dashboard
  // direct edit). When the prop's crm_stage_id changes between renders
  // we briefly flash the dropdown so the operator notices the shift
  // without having to inspect.
  useEffect(() => {
    const prev = prevStageIdRef.current;
    const next = conversation.crm_stage_id;
    if (prev !== null && next !== null && prev !== next) {
      setStageJustChanged(true);
      const t = setTimeout(() => setStageJustChanged(false), 1800);
      return () => clearTimeout(t);
    }
    prevStageIdRef.current = next;
  }, [conversation.crm_stage_id]);

  // Inline-editable handler for the Lead-section fields. Single PATCH
  // per field, optimistic update on success. Toast on failure so the
  // operator can recover.
  async function patchLeadField(field: 'name' | 'city' | 'wedding_date' | 'guest_count' | 'budget_range' | 'service_type', next: string | null) {
    if (!conversation.contact_id) {
      toast.error('Cannot edit — no contact linked');
      return;
    }
    const res = await fetch(`/api/contacts/${conversation.contact_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error('Could not save', { description: data?.error });
      return;
    }
    // Reflect locally so the row updates without waiting for realtime.
    const patch: Partial<Conversation> = {};
    if (field === 'name') patch.contact_name = next;
    if (field === 'city') patch.city = next;
    if (field === 'wedding_date') patch.wedding_date = next;
    if (field === 'guest_count') patch.guest_count = next;
    if (field === 'budget_range') patch.budget_range = next;
    if (field === 'service_type') patch.service_type = next;
    onConversationUpdate({ ...conversation, ...patch });
  }

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

  // Normalize identically to the API so the optimistic UI matches
  // what gets persisted (#VIP / #vip / #Vip → "vip"). Returns null
  // when the string normalizes to empty.
  function normalizeTag(raw: string): string | null {
    const t = raw.trim().toLowerCase().replace(/^#+/, '');
    return t === '' ? null : t;
  }

  function addTag(rawValue?: string) {
    // Accept comma / newline / semicolon-separated input. Paste
    // "vip, urgent, decor" → three tags, not one tag with commas.
    const input = rawValue ?? tagInput;
    const parts = input.split(/[,;\n]+/).map(normalizeTag).filter((t): t is string => !!t);
    if (parts.length === 0) return;
    const current = conversation.tags ?? [];
    const seen = new Set(current);
    const added: string[] = [];
    for (const t of parts) {
      if (!seen.has(t)) {
        seen.add(t);
        added.push(t);
      }
    }
    setTagInput('');
    if (added.length === 0) return;
    setTags([...current, ...added]);
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
        // Roll back optimistic update first — whichever path we take next.
        onConversationUpdate({ ...conversation, crm_stage_id: prevId, crm_stage_name: prevName });
        // 400 + ux=modal → open the missing-info form so the operator
        // can fill it inline. Anything else (toast UX, generic errors)
        // → surface the error inline and stop.
        if (res.status === 400 && data?.ux === 'modal' && Array.isArray(data?.missing) && data.missing.length > 0) {
          const targetName = data.target_stage_name
            ?? stages?.find((s) => s.id === stageId)?.name
            ?? '';
          setStageGate({
            targetStageId: stageId,
            targetStageName: targetName,
            missing: data.missing.filter((m: string): m is MissingField => ['venue', 'city', 'value', 'label'].includes(m)),
            message: data.error ?? 'Add the missing info to continue.',
          });
        } else {
          setStageError(data?.error ?? 'Could not update stage');
        }
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

  // Called when the StageRequirementsModal submits. Writes the deal
  // fields via PATCH /crm-deal, then retries the stage change. Done
  // here (rather than inside the modal) so the modal stays
  // presentation-only and the retry logic stays next to changeStage.
  async function submitStageGate(values: { venue?: string; city?: string; value?: number; label_ids?: number[] }): Promise<string | null> {
    if (!stageGate) return null;
    const dealPatchBody: Record<string, unknown> = {};
    if (values.venue !== undefined) dealPatchBody.venue = values.venue;
    if (values.city !== undefined) dealPatchBody.city = values.city;
    if (values.value !== undefined) dealPatchBody.value = values.value;
    if (values.label_ids !== undefined) dealPatchBody.label_ids = values.label_ids;
    if (Object.keys(dealPatchBody).length === 0) return 'No fields to save.';
    try {
      const dealRes = await fetch(`/api/conversations/${conversation.id}/crm-deal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dealPatchBody),
      });
      if (!dealRes.ok) {
        const data = await dealRes.json().catch(() => ({}));
        return data?.error ?? 'Could not save deal fields.';
      }
    } catch {
      return 'Network error while saving deal fields.';
    }
    // Now retry the stage change.
    const stageId = stageGate.targetStageId;
    setStageGate(null);
    await changeStage(stageId);
    return null;
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

      {/* Lead snapshot — inline-editable. Hover any row to see the pencil
          icon; click to switch into an input. Enter to save, Esc to cancel. */}
      <Section title="Lead">
        {conversation.contact_id ? (
          <>
            <EditableRow label="City" value={conversation.city} placeholder="—" onSave={(v) => patchLeadField('city', v)} />
            <EditableRow label="Event date" value={conversation.wedding_date} placeholder="—" onSave={(v) => patchLeadField('wedding_date', v)} />
            <EditableRow label="Guests" value={conversation.guest_count} placeholder="—" onSave={(v) => patchLeadField('guest_count', v)} />
            <EditableRow label="Budget" value={conversation.budget_range} placeholder="—" onSave={(v) => patchLeadField('budget_range', v)} />
            <EditableRow label="Service" value={conversation.service_type} placeholder="—" onSave={(v) => patchLeadField('service_type', v)} />
          </>
        ) : (
          <>
            <InfoRow label="City" value={conversation.city} />
            <InfoRow label="Event date" value={conversation.wedding_date} />
            <InfoRow label="Guests" value={conversation.guest_count} />
            <InfoRow label="Budget" value={conversation.budget_range} />
            <InfoRow label="Service" value={conversation.service_type} />
            <p className="text-[10px] text-text-muted mt-2 italic">Send a message to link this conversation to a contact, then fields become editable.</p>
          </>
        )}
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
            onChange={(e) => {
              // Comma-trigger: typing "," (or ";") commits the current
              // value as a tag without making the user press Enter.
              // Keeps the input feel fast for power users.
              const v = e.target.value;
              if (/[,;]/.test(v)) {
                addTag(v);
              } else {
                setTagInput(v);
              }
            }}
            onPaste={(e) => {
              // If the clipboard contains commas/newlines/semicolons,
              // treat the whole paste as a multi-tag entry and skip the
              // default single-string paste.
              const text = e.clipboardData.getData('text');
              if (text && /[,;\n]/.test(text)) {
                e.preventDefault();
                addTag(text);
              }
            }}
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
          <div className="flex items-baseline justify-between gap-3 py-1">
            <span className="text-xs text-text-secondary">Deal</span>
            <span className="text-xs flex items-center gap-2">
              <span className="text-text-default font-medium">#{conversation.crm_deal_id}</span>
              {dealValue !== null && dealValue > 0 && (
                <span
                  className="text-[10px] font-semibold bg-brand-soft text-brand border border-brand/20 rounded-full px-1.5 py-0.5"
                  title={`Deal value ₹${dealValue.toLocaleString('en-IN')}`}
                >
                  {formatINRShort(dealValue)}
                </span>
              )}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-1">
            <span className="text-xs text-text-secondary">Stage</span>
            {stages && stages.length > 0 ? (
              <select
                value={conversation.crm_stage_id ?? ''}
                onChange={(e) => changeStage(parseInt(e.target.value, 10))}
                disabled={updatingStage}
                // Brief flash highlight when the stage id changes out from
                // under us via realtime (cron or another tab). Driven by
                // the stageJustChanged state — clears itself after 1.8s.
                className={`text-xs bg-canvas border rounded px-1.5 py-1 max-w-[60%] text-text-default focus:outline-none focus:border-border-strong disabled:opacity-50 transition-all duration-700 ${
                  stageJustChanged
                    ? 'border-brand ring-2 ring-brand/30 bg-brand-soft'
                    : 'border-border-default'
                }`}
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
            {events.map((e) => {
              const isSystemEvent =
                !e.actor_name ||
                e.event_type === 'ABSTAIN' ||
                e.event_type === 'CALLBACK_DETECTED' ||
                e.event_type === 'CONTACT_MERGED' ||
                e.event_type === 'CRM_DEAL_DELETED' ||
                (e.event_type === 'CRM_STAGE_CHANGED' && e.metadata?.source === 'crm-sync');
              return (
                <li key={e.id} className="text-xs flex items-start gap-2">
                  <ActivityAvatar name={e.actor_name ?? 'system'} isSystem={isSystemEvent} />
                  <div className="min-w-0 flex-1">
                    <p className="text-text-default leading-snug break-words">{eventLabel(e)}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      {new Date(e.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Section>
      </aside>
      {stageGate && (
        <StageRequirementsModal
          targetStageName={stageGate.targetStageName}
          missing={stageGate.missing}
          message={stageGate.message}
          onCancel={() => setStageGate(null)}
          onSubmit={submitStageGate}
        />
      )}
    </>
  );
}

// Labels offered when the operator needs to add one because the deal is
// a Makeup category. These match the CRM frontend's VenueModal
// hardcoded list (Party Makeup = id 3, Bridal Makeup = id 4 in the
// labels table). If the CRM adds more categories that gate on label,
// extend this and the helper in lib/crm-stage-requirements.ts together.
const MAKEUP_LABEL_OPTIONS: Array<{ id: number; name: string }> = [
  { id: 3, name: 'Party Makeup' },
  { id: 4, name: 'Bridal Makeup' },
];

function StageRequirementsModal({
  targetStageName,
  missing,
  message,
  onCancel,
  onSubmit,
}: {
  targetStageName: string;
  missing: Array<'venue' | 'city' | 'value' | 'label'>;
  message: string;
  onCancel: () => void;
  onSubmit: (values: { venue?: string; city?: string; value?: number; label_ids?: number[] }) => Promise<string | null>;
}) {
  const needsVenue = missing.includes('venue');
  const needsCity = missing.includes('city');
  const needsValue = missing.includes('value');
  const needsLabel = missing.includes('label');

  const [venue, setVenue] = useState('');
  const [city, setCity] = useState('');
  const [value, setValue] = useState('');
  const [labelId, setLabelId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, { onEscape: onCancel });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Per-field validation before we round-trip.
    if (needsVenue && !venue.trim()) { setError('Venue is required'); return; }
    if (needsCity && !city.trim()) { setError('City is required'); return; }
    if (needsValue) {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) { setError('Deal value must be a positive number'); return; }
    }
    if (needsLabel && !labelId) { setError('Label is required'); return; }
    setBusy(true);
    const payload: { venue?: string; city?: string; value?: number; label_ids?: number[] } = {};
    if (needsVenue) payload.venue = venue.trim();
    if (needsCity) payload.city = city.trim();
    if (needsValue) payload.value = Number(value);
    if (needsLabel && labelId) payload.label_ids = [labelId];
    const err = await onSubmit(payload);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]"
      onClick={onCancel}
      role="presentation"
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stage-requirements-title"
        tabIndex={-1}
        className="bg-elevated rounded-xl shadow-xl w-full max-w-md border border-border-default focus:outline-none"
      >
        <div className="px-5 py-4 border-b border-border-default">
          <h2 id="stage-requirements-title" className="text-base font-semibold text-text-primary">
            Add missing info
          </h2>
          <p className="text-[12px] text-text-secondary mt-1">
            {message}{targetStageName ? ` Required to move to ${targetStageName}.` : ''}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          {needsVenue && (
            <div>
              <label className="block text-[11px] font-medium text-text-secondary mb-1">Venue</label>
              <input
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="e.g. ITC Maurya, Delhi"
                disabled={busy}
                className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default focus:outline-none focus:border-border-strong"
                autoFocus
              />
            </div>
          )}
          {needsCity && (
            <div>
              <label className="block text-[11px] font-medium text-text-secondary mb-1">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Delhi"
                disabled={busy}
                className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default focus:outline-none focus:border-border-strong"
              />
            </div>
          )}
          {needsValue && (
            <div>
              <label className="block text-[11px] font-medium text-text-secondary mb-1">Deal value (₹)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. 500000"
                disabled={busy}
                className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default focus:outline-none focus:border-border-strong"
              />
            </div>
          )}
          {needsLabel && (
            <div>
              <label className="block text-[11px] font-medium text-text-secondary mb-1">Label</label>
              <select
                value={labelId}
                onChange={(e) => setLabelId(e.target.value ? Number(e.target.value) : '')}
                disabled={busy}
                className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default focus:outline-none focus:border-border-strong"
              >
                <option value="">— Select —</option>
                {MAKEUP_LABEL_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="bg-danger-soft border border-danger/20 text-danger text-xs px-3 py-2 rounded-md">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="text-xs text-text-secondary hover:text-text-default px-3 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="text-xs bg-brand text-text-inverse rounded-md px-3 py-2 font-medium disabled:opacity-50 hover:opacity-90"
            >
              {busy ? 'Saving…' : 'Save & move'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
