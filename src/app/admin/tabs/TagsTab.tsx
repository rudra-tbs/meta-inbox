'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';

interface TagRow {
  name: string;
  display_name: string;
  color: string | null;
  created_at: string;
  created_by_name: string | null;
}

export default function TagsTab() {
  const [rows, setRows] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/tags');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? 'Could not load tags');
        return;
      }
      setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deleteTag(name: string, label: string) {
    if (!confirm(`Delete tag "${label}"? Conversations that already have this tag keep it; new conversations just can't pick it from the dropdown anymore.`)) return;
    setError(null);
    const res = await fetch(`/api/admin/tags?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data?.error ?? 'Could not delete'); return; }
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Tag taxonomy</h3>
          <p className="text-[12px] text-text-secondary mt-0.5 max-w-xl">
            Master list of tags agents can apply to conversations. The DetailRail tag input autocompletes from this list, and applied tags are normalized to the canonical name on save so <code className="font-mono text-[11px] bg-muted px-1 rounded">#vip</code> / <code className="font-mono text-[11px] bg-muted px-1 rounded">#VIP</code> / <code className="font-mono text-[11px] bg-muted px-1 rounded">#Vip</code> can&apos;t drift apart.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
          + Add tag
        </Button>
      </div>

      {error && <div className="bg-danger-soft border border-danger/20 text-danger text-xs px-3 py-2 rounded-md">{error}</div>}

      <div className="rounded-lg border border-border-default bg-elevated overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-text-muted text-center">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-text-muted text-center">
            No tags yet. Click <strong>+ Add tag</strong> to define your first one.
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {rows.map((t) => (
              <div key={t.name} className="px-4 py-3 flex items-center gap-3">
                <span
                  className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded border"
                  style={
                    t.color
                      ? { backgroundColor: `${t.color}22`, borderColor: `${t.color}55`, color: t.color }
                      : undefined
                  }
                >
                  {t.display_name}
                </span>
                <span className="text-[11px] text-text-muted font-mono">{t.name}</span>
                <span className="text-[11px] text-text-muted ml-auto">
                  Added {new Date(t.created_at).toLocaleDateString()}{t.created_by_name ? ` by ${t.created_by_name}` : ''}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteTag(t.name, t.display_name)}
                  className="text-danger hover:text-danger"
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {createOpen && (
        <CreateTagModal
          onClose={() => setCreateOpen(false)}
          onCreated={async () => { setCreateOpen(false); await load(); }}
        />
      )}
    </div>
  );
}

function CreateTagModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [color, setColor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!displayName.trim()) { setError('Name is required'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName.trim(),
          color: color.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Could not create'); return; }
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-96 bg-elevated rounded-xl shadow-xl border border-border-default p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">Add tag</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xl leading-none" aria-label="Close">×</button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">Display name</label>
            <input
              autoFocus
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. VIP"
              maxLength={40}
              className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
            />
            <p className="text-[11px] text-text-muted mt-1">
              Stored canonical-form: <code className="font-mono">{displayName ? displayName.trim().toLowerCase().replace(/^#/, '') : '(empty)'}</code>
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">Color (optional)</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#7c3aed'}
                onChange={(e) => setColor(e.target.value)}
                className="w-9 h-9 rounded border border-border-default cursor-pointer"
                aria-label="Tag color"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#aabbcc or leave blank"
                className="flex-1 text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default font-mono focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
              />
              {color && (
                <button
                  type="button"
                  onClick={() => setColor('')}
                  className="text-[11px] text-text-muted hover:text-danger"
                  title="Clear"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-danger-soft border border-danger/20 text-danger text-xs px-3 py-2 rounded-md">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={submit} disabled={busy || !displayName.trim()}>
              {busy ? 'Adding…' : 'Add tag'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
