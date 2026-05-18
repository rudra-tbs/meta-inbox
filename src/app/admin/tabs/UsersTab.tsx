'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'AGENT';
  active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  access: Array<{ brand: string; channel: string }>;
}

interface OnboardingState {
  brands: Array<{ id: string; name: string; subtitle: string }>;
  configured: Array<{ brand: string; channel: string; display_name: string | null }>;
  pipelineError: string | null;
}

interface UsersTabProps {
  currentUserId: string;
}

const CHANNEL_LABELS: Record<string, string> = { WA: 'WhatsApp', IG: 'Instagram' };

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function UsersTab({ currentUserId }: UsersTabProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [uRes, sRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/onboarding/state'),
      ]);
      if (!uRes.ok) {
        const data = await uRes.json().catch(() => ({}));
        setError(data?.error ?? 'Could not load users');
        return;
      }
      setUsers(await uRes.json());
      if (sRes.ok) setState(await sRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setRole(id: string, role: 'ADMIN' | 'AGENT') {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Could not change role'); return; }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function setActive(id: string, active: boolean) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Could not update'); return; }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function saveAccess(id: string, access: Array<{ brand: string; channel: string }>) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}/access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Could not save access'); return; }
      setExpandedId(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Team members</h3>
        <p className="text-[12px] text-text-secondary mt-0.5">
          {users.length} {users.length === 1 ? 'user' : 'users'}. Edit roles, manage brand/channel access, deactivate accounts.
        </p>
      </div>

      {error && <div className="bg-danger-soft border border-danger/20 text-danger text-xs px-3 py-2 rounded-md">{error}</div>}

      <div className="rounded-lg border border-border-default bg-elevated overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-text-muted text-center">Loading…</div>
        ) : users.length === 0 ? (
          <div className="p-6 text-sm text-text-muted text-center">No users yet.</div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {users.map((u) => {
              const isMe = u.id === currentUserId;
              const busy = busyId === u.id;
              const expanded = expandedId === u.id;
              return (
                <div key={u.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold ${u.active ? 'text-text-primary' : 'text-text-muted line-through'}`}>
                          {u.name}
                        </span>
                        {isMe && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-brand-soft text-brand font-medium">You</span>}
                        {!u.active && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-danger-soft text-danger font-medium">Inactive</span>}
                      </div>
                      <div className="text-[11px] text-text-secondary truncate">{u.email}</div>
                      <div className="text-[11px] text-text-muted mt-0.5 flex flex-wrap gap-x-3">
                        <span>{u.access.length === 0 ? 'No access' : `${u.access.length} brand·channel`}</span>
                        <span>· Last seen {timeAgo(u.last_sign_in_at)}</span>
                      </div>
                    </div>

                    <select
                      value={u.role}
                      onChange={(e) => setRole(u.id, e.target.value as 'ADMIN' | 'AGENT')}
                      disabled={busy}
                      className="text-[12px] border border-border-default rounded px-2 py-1 bg-elevated text-text-default focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:opacity-50"
                    >
                      <option value="AGENT">Agent</option>
                      <option value="ADMIN">Admin</option>
                    </select>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setExpandedId(expanded ? null : u.id)}
                      disabled={busy}
                    >
                      {expanded ? 'Close' : 'Access'}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActive(u.id, !u.active)}
                      disabled={busy || isMe}
                      className={u.active ? 'text-danger hover:text-danger' : 'text-success hover:text-success'}
                    >
                      {u.active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </div>

                  {expanded && (
                    <AccessEditor
                      user={u}
                      state={state}
                      busy={busy}
                      onCancel={() => setExpandedId(null)}
                      onSave={(access) => saveAccess(u.id, access)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AccessEditor({
  user,
  state,
  busy,
  onCancel,
  onSave,
}: {
  user: AdminUser;
  state: OnboardingState | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (access: Array<{ brand: string; channel: string }>) => void;
}) {
  const [picked, setPicked] = useState<Array<{ brand: string; channel: string }>>(user.access);

  if (!state) {
    return <div className="mt-3 pt-3 border-t border-border-subtle text-xs text-text-muted">Loading brands…</div>;
  }

  if (user.role === 'ADMIN') {
    return (
      <div className="mt-3 pt-3 border-t border-border-subtle text-xs text-text-muted">
        Admins automatically see every brand and channel — no access rows needed.
      </div>
    );
  }

  function toggle(brand: string, channel: string) {
    setPicked((prev) => {
      const exists = prev.some((p) => p.brand === brand && p.channel === channel);
      return exists
        ? prev.filter((p) => !(p.brand === brand && p.channel === channel))
        : [...prev, { brand, channel }];
    });
  }

  // Group configured rows by brand
  const byBrand = new Map<string, Array<{ channel: string; display_name: string | null }>>();
  for (const c of state.configured) {
    const arr = byBrand.get(c.brand) ?? [];
    arr.push({ channel: c.channel, display_name: c.display_name });
    byBrand.set(c.brand, arr);
  }
  const brandNameFor = (id: string) => state.brands.find((b) => b.id === id)?.name ?? id;

  const sortedBrands = Array.from(byBrand.keys()).sort((a, b) => brandNameFor(a).localeCompare(brandNameFor(b)));

  return (
    <div className="mt-3 pt-3 border-t border-border-subtle space-y-3">
      {sortedBrands.length === 0 ? (
        <p className="text-xs text-text-muted">No channels configured anywhere yet.</p>
      ) : (
        <div className="space-y-2">
          {sortedBrands.map((brandId) => (
            <div key={brandId} className="rounded border border-border-subtle px-3 py-2">
              <div className="text-[12px] font-semibold text-text-primary mb-1">{brandNameFor(brandId)}</div>
              <div className="flex flex-wrap gap-3">
                {byBrand.get(brandId)!.map((c) => {
                  const on = picked.some((p) => p.brand === brandId && p.channel === c.channel);
                  return (
                    <label key={c.channel} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(brandId, c.channel)}
                        className="w-3.5 h-3.5"
                      />
                      <span className="text-text-default">{CHANNEL_LABELS[c.channel] ?? c.channel}</span>
                      {c.display_name && (
                        <span className="text-[11px] text-text-muted truncate max-w-[150px]">· {c.display_name}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={() => onSave(picked)} disabled={busy}>
          {busy ? 'Saving…' : 'Save access'}
        </Button>
      </div>
    </div>
  );
}
