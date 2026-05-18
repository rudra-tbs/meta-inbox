'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'AGENT';
  created_at: string;
  user_access?: Array<{ brand: string; channel: string }>;
}

interface UsersTabProps {
  currentUserId: string;
}

export default function UsersTab({ currentUserId }: UsersTabProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/users');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? 'Could not load users');
        return;
      }
      setUsers(await res.json());
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

  async function remove(id: string, name: string) {
    if (!confirm(`Delete ${name}? This removes their account and all access. Cannot be undone.`)) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Could not delete user'); return; }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">All users</h3>
        <p className="text-[12px] text-text-secondary mt-0.5">
          Promote agents to admins, demote admins to agents, or remove users. You can&apos;t delete yourself or the last admin.
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
              const accessCount = u.user_access?.length ?? 0;
              const busy = busyId === u.id;
              return (
                <div key={u.id} className="p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary truncate">{u.name}</span>
                      {isMe && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-brand-soft text-brand font-medium">You</span>}
                    </div>
                    <div className="text-[11px] text-text-secondary truncate">{u.email}</div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      {accessCount === 0 ? 'No brand access' : `${accessCount} brand·channel${accessCount === 1 ? '' : 's'}`}
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
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(u.id, u.name)}
                    disabled={busy || isMe}
                    className="text-danger hover:text-danger"
                  >
                    Delete
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
