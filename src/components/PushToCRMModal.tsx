'use client';

import { useEffect, useState } from 'react';
import type { Conversation, Message, AppUser } from '@/types';

interface CRMUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

interface PushToCRMModalProps {
  conversation: Conversation;
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

function mapServiceTypeToDropdown(st: string | null): string {
  if (!st) return '';
  const lower = st.toLowerCase();
  if (lower.includes('planning') && lower.includes('decor')) return 'planning+decor';
  if (lower.includes('decor')) return 'decor-only';
  if (lower.includes('planning') || lower.includes('full') || lower.includes('end')) return 'planning-only';
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
  messages,
  currentUser,
  onSuccess,
  onClose,
}: PushToCRMModalProps) {
  const [crmUsers, setCRMUsers] = useState<CRMUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [clientName, setClientName] = useState(conversation.contact_name ?? '');
  const [city, setCity] = useState(conversation.city ?? '');
  const [weddingDate, setWeddingDate] = useState(parseWeddingDate(conversation.wedding_date));
  const [guestCount, setGuestCount] = useState(conversation.guest_count ?? '');
  const [budget, setBudget] = useState(parseBudget(conversation.budget_range));
  const [serviceType, setServiceType] = useState(mapServiceTypeToDropdown(conversation.service_type));
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
          service_type: (serviceType as 'planning-only' | 'decor-only' | 'planning+decor') || null,
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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">Push to CRM</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Client name */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Client name *</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Full name"
            />
          </div>

          {/* Phone (readonly) */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
            <input
              type="text"
              value={`+${conversation.phone_number}`}
              readOnly
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-slate-500 cursor-not-allowed"
            />
          </div>

          {/* City */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Wedding city"
            />
          </div>

          {/* Wedding date */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Wedding date</label>
            <input
              type="date"
              value={weddingDate}
              onChange={(e) => setWeddingDate(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Guest count */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Guest count</label>
            <input
              type="text"
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="e.g. 200"
            />
          </div>

          {/* Budget */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Budget (lakhs)</label>
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="e.g. 15"
              min={0}
            />
          </div>

          {/* Service type */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Service type</label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            >
              <option value="">— Select —</option>
              <option value="planning-only">Planning only</option>
              <option value="decor-only">Decor only</option>
              <option value="planning+decor">Planning + Decor</option>
            </select>
          </div>

          {/* Assign to */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Assign to</label>
            {loadingUsers ? (
              <div className="text-xs text-slate-400 py-2">Loading users…</div>
            ) : (
              <select
                value={assignToCRMUserId}
                onChange={(e) => setAssignToCRMUserId(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
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
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              placeholder="Any notes for the planner…"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-green-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Pushing…' : 'Push to CRM'}
          </button>
        </div>
      </div>
    </div>
  );
}
