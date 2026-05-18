'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';

interface BrandChannelRow {
  id: string;
  brand: string;
  channel: string;
  external_account_id: string;
  access_token_preview: string;
  display_name: string | null;
  configured_at: string;
  updated_at: string;
  configured_by_name: string | null;
  configured_by_email: string | null;
}

const CHANNEL_LABELS: Record<string, string> = { WA: 'WhatsApp', IG: 'Instagram DMs' };

export default function AdminChannelsTab() {
  const [rows, setRows] = useState<BrandChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/brand-channels');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? 'Could not load channels');
        return;
      }
      setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function remove(id: string, label: string) {
    if (!confirm(`Disconnect ${label}? Conversations stay but new inbound on this number will be ignored until reconnected.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/brand-channels/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Could not delete'); return; }
      await load();
    } catch {
      setError('Network error.');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Connected channels</h3>
        <p className="text-[12px] text-text-secondary mt-0.5">
          Every brand+channel currently wired into the inbox. Rotate the access token here if Meta forces a refresh, or disconnect a channel entirely.
        </p>
      </div>

      {error && <div className="bg-danger-soft border border-danger/20 text-danger text-xs px-3 py-2 rounded-md">{error}</div>}

      <div className="rounded-lg border border-border-default bg-elevated overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-text-muted text-center">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-text-muted text-center">
            No channels connected yet. Use the signup flow or ask an agent to connect one.
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {rows.map((r) => (
              <ChannelRow
                key={r.id}
                row={r}
                editing={editingId === r.id}
                onEditStart={() => setEditingId(r.id)}
                onEditCancel={() => setEditingId(null)}
                onChanged={async () => { setEditingId(null); await load(); }}
                onDelete={() => remove(r.id, `${r.brand} · ${CHANNEL_LABELS[r.channel] ?? r.channel}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelRow({
  row,
  editing,
  onEditStart,
  onEditCancel,
  onChanged,
  onDelete,
}: {
  row: BrandChannelRow;
  editing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onChanged: () => void;
  onDelete: () => void;
}) {
  const [accountId, setAccountId] = useState(row.external_account_id);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const payload: Record<string, string> = {};
      if (accountId.trim() !== row.external_account_id) payload.external_account_id = accountId.trim();
      if (token.trim()) payload.access_token = token.trim();
      if (Object.keys(payload).length === 0) {
        setError('Nothing to update.');
        return;
      }
      const res = await fetch(`/api/brand-channels/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Could not save'); return; }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-primary">{row.brand}</span>
            <span className="text-[11px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-text-secondary font-medium">
              {CHANNEL_LABELS[row.channel] ?? row.channel}
            </span>
            {row.display_name && (
              <span className="text-[12px] text-text-secondary truncate">{row.display_name}</span>
            )}
          </div>
          <div className="text-[11px] text-text-muted mt-1 space-y-0.5">
            <div>Account ID: <span className="font-mono">{row.external_account_id}</span></div>
            <div>Token: <span className="font-mono">{row.access_token_preview}</span></div>
            <div>
              Configured {new Date(row.configured_at).toLocaleDateString()} by {row.configured_by_name ?? 'unknown'}
            </div>
          </div>
        </div>
        {!editing && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button variant="secondary" size="sm" onClick={onEditStart}>Edit</Button>
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-danger hover:text-danger">Disconnect</Button>
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-4 pt-4 border-t border-border-subtle space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-text-default mb-1">Account ID</label>
            <input
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full px-3 py-2 border border-border-default rounded-md text-sm text-text-default font-mono focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-text-default mb-1">Access token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Leave blank to keep current"
              className="w-full px-3 py-2 border border-border-default rounded-md text-sm text-text-default focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
            />
            <p className="text-[11px] text-text-muted mt-1">
              Re-validated against Meta before saving.
            </p>
          </div>
          {error && <div className="text-[11px] text-danger">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onEditCancel} disabled={busy}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
