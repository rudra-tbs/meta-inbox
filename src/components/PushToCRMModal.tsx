'use client';

import { useEffect, useState } from 'react';
import type { Conversation, Message, AppUser } from '@/types';

interface CRMUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

// Preview payload returned by /api/conversations/[id]/push-preview.
// Resolves the pipeline + initial stage names so the modal can show
// "About to create" without the admin having to recall what brand 67
// maps to in CRM. Defaults to nulls if anything fails — modal falls
// back to a less-informative preview rather than refusing to render.
interface PushPreview {
  brand: string;
  brand_name: string | null;
  pipeline_id: number | null;
  pipeline_name: string | null;
  initial_stage_id: number | null;
  initial_stage_name: string | null;
}

interface PushToCRMModalProps {
  conversation: Conversation;
  brandName?: string | null;
  messages: Message[];
  currentUser: AppUser;
  onSuccess: (dealId: number) => void;
  onClose: () => void;
}

function parseBudget(raw: string | null): string {
  if (!raw) return '';
  const match = raw.match(/\d+/);
  return match ? match[0] : '';
}

function parseWeddingDate(raw: string | null): string {
  if (!raw) return '';
  // Try direct ISO first
  const iso = new Date(raw);
  if (!isNaN(iso.getTime())) return iso.toISOString().slice(0, 10);
  // Try "March 2026" / "15 March 2026" / "15th March 2026"
  const cleaned = raw.replace(/(\d+)(st|nd|rd|th)/, '$1');
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '';
}

function lastAIMessages(messages: Message[], count = 5): string {
  return messages
    .filter((m) => m.sender === 'AI')
    .slice(-count)
    .map((m) => m.content)
    .join('\n\n');
}

export default function PushToCRMModal({
  conversation,
  brandName,
  messages,
  currentUser,
  onSuccess,
  onClose,
}: PushToCRMModalProps) {
  const [crmUsers, setCRMUsers] = useState<CRMUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  // Preview state: pipeline + initial stage names so the admin can
  // catch a wrong mapping BEFORE the deal lands in CRM.
  const [preview, setPreview] = useState<PushPreview | null>(null);

  const [clientName, setClientName] = useState(conversation.contact_name ?? '');
  const [city, setCity] = useState(conversation.city ?? '');
  const [weddingDate, setWeddingDate] = useState(parseWeddingDate(conversation.wedding_date));
  const [guestCount, setGuestCount] = useState(conversation.guest_count ?? '');
  const [budget, setBudget] = useState(parseBudget(conversation.budget_range));
  const [assignToCRMUserId, setAssignToCRMUserId] = useState<string>('');
  const [notes, setNotes] = useState(lastAIMessages(messages));

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/crm-users')
      .then((r) => r.json())
      .then((users: CRMUser[]) => {
        setCRMUsers(users);
        // Default to logged-in user if email matches
        const match = users.find(
          (u) => u.email.toLowerCase() === currentUser.email.toLowerCase()
        );
        if (match) setAssignToCRMUserId(String(match.id));
        else if (users.length > 0) setAssignToCRMUserId(String(users[0].id));
      })
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  }, [currentUser.email]);

  // Pull the resolved pipeline + initial-stage that THIS push would land
  // in, so the modal can show "About to create — Pipeline: TBS,
  // Initial stage: Qualified" up front. Server endpoint resolves
  // brand → pipeline id (brand IS the pipeline id post-cleanup) and
  // brand_settings.initial_stage_id → stage name in one round-trip.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/conversations/${conversation.id}/push-preview`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PushPreview | null) => {
        if (!cancelled && data) setPreview(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [conversation.id]);

  // Resolve the chosen CRM user's display name for the preview line.
  const selectedCrmUser = crmUsers.find((u) => String(u.id) === assignToCRMUserId) ?? null;
  const ownerName = selectedCrmUser
    ? `${selectedCrmUser.first_name} ${selectedCrmUser.last_name}`.trim()
    : '— Unassigned —';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim()) { setError('Client name is required'); return; }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/conversations/${conversation.id}/push-to-crm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: clientName.trim(),
          city: city.trim() || null,
          wedding_date: weddingDate || null,
          guest_count: guestCount.trim() || null,
          budget: budget ? Number(budget) : null,
          service_type: conversation.service_type ?? null,
          assign_to_crm_user_id: assignToCRMUserId ? Number(assignToCRMUserId) : null,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to push to CRM');
        return;
      }
      onSuccess(data.crm_deal_id);
    } catch {
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-elevated rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col border border-border-default">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <h2 className="text-base font-semibold text-text-primary">Push to CRM</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* About-to-create preview. Pipeline + initial stage come from
              the server preview endpoint; brand + owner are resolved
              client-side. Renders even when the preview endpoint hasn't
              loaded yet — falls back to "loading…" placeholders. */}
          <div className="rounded-md border border-border-default bg-canvas px-3 py-2.5 text-[12px]">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-text-muted mb-1.5">
              About to create
            </p>
            <dl className="grid grid-cols-[80px_1fr] gap-y-1 gap-x-3">
              <dt className="text-text-secondary">Deal</dt>
              <dd className="text-text-default font-medium truncate">
                {clientName.trim() || <span className="text-text-disabled">(fill client name)</span>}
              </dd>
              <dt className="text-text-secondary">Brand</dt>
              <dd className="text-text-default truncate">
                {brandName ?? preview?.brand_name ?? <span className="text-text-muted">{preview?.brand ?? conversation.brand}</span>}
              </dd>
              <dt className="text-text-secondary">Pipeline</dt>
              <dd className="text-text-default truncate">
                {preview
                  ? preview.pipeline_name
                    ? <>{preview.pipeline_name} <span className="text-text-muted font-mono">#{preview.pipeline_id}</span></>
                    : <span className="text-warning">unresolved — admin must map pipeline</span>
                  : <span className="text-text-muted">…</span>}
              </dd>
              <dt className="text-text-secondary">Initial stage</dt>
              <dd className="text-text-default truncate">
                {preview
                  ? preview.initial_stage_name
                    ? <>{preview.initial_stage_name} <span className="text-text-muted font-mono">#{preview.initial_stage_id}</span></>
                    : <span className="text-warning">not set — push will use env-var fallback or fail</span>
                  : <span className="text-text-muted">…</span>}
              </dd>
              <dt className="text-text-secondary">Owner</dt>
              <dd className="text-text-default truncate">{ownerName}</dd>
            </dl>
          </div>

          {/* Client name */}
          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">Client name *</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default placeholder:text-text-muted focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
              placeholder="Full name"
            />
          </div>

          {/* Phone (readonly) */}
          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">Phone</label>
            <input
              type="text"
              value={`+${conversation.phone_number}`}
              readOnly
              className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-canvas text-text-secondary cursor-not-allowed"
            />
          </div>

          {/* City */}
          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default placeholder:text-text-muted focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
              placeholder="Event city"
            />
          </div>

          {/* Event date */}
          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">Event date</label>
            <input
              type="date"
              value={weddingDate}
              onChange={(e) => setWeddingDate(e.target.value)}
              className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default placeholder:text-text-muted focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
            />
          </div>

          {/* Guest count */}
          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">Guest count</label>
            <input
              type="text"
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
              className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default placeholder:text-text-muted focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
              placeholder="e.g. 200"
            />
          </div>

          {/* Budget */}
          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">Budget (lakhs)</label>
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default placeholder:text-text-muted focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
              placeholder="e.g. 15"
              min={0}
            />
          </div>

          {/* Assign to */}
          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">Assign to</label>
            {loadingUsers ? (
              <div className="text-xs text-text-muted py-2">Loading users…</div>
            ) : (
              <select
                value={assignToCRMUserId}
                onChange={(e) => setAssignToCRMUserId(e.target.value)}
                className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default placeholder:text-text-muted focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
              >
                <option value="">— Unassigned —</option>
                {crmUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.first_name} {u.last_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default placeholder:text-text-muted focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15 resize-none"
              placeholder="Any notes for the planner…"
            />
          </div>

          {error && (
            <div className="bg-danger-soft border border-danger/20 rounded-md px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-default">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-text-secondary hover:text-text-primary px-4 py-2"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-brand text-text-inverse text-sm font-medium px-5 py-2 rounded-md hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {submitting ? 'Pushing…' : 'Push to CRM'}
          </button>
        </div>
      </div>
    </div>
  );
}
