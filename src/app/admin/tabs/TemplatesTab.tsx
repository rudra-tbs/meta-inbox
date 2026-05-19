'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';

interface Template {
  id: string;
  brand: string;
  name: string;
  content: string;
  shortcut: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface OnboardingBrand { id: string; name: string; subtitle: string }
interface OnboardingState {
  brands: OnboardingBrand[];
  configured: Array<{ brand: string; channel: string; display_name: string | null }>;
  pipelineError: string | null;
}

// Templates RMs trigger from the chat input via `/`. Admin curates here.
// One list across all brands with a brand filter — easier than a tab per brand.
export default function TemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (brandFilter) params.set('brand', brandFilter);
      const [tRes, sRes] = await Promise.all([
        fetch(`/api/reply-templates${params.toString() ? `?${params.toString()}` : ''}`),
        fetch('/api/onboarding/state'),
      ]);
      if (!tRes.ok) {
        const data = await tRes.json().catch(() => ({}));
        setError(data?.error ?? 'Could not load templates');
        return;
      }
      setTemplates(await tRes.json());
      if (sRes.ok) setState(await sRes.json());
    } finally {
      setLoading(false);
    }
  }, [brandFilter]);

  useEffect(() => { load(); }, [load]);

  const brandNameFor = useMemo(() => {
    const map = new Map<string, string>();
    if (state) for (const b of state.brands) map.set(b.id, b.name);
    return (id: string) => map.get(id) ?? id;
  }, [state]);

  async function remove(t: Template) {
    if (!confirm(`Delete template "${t.name}"? Agents using it via the / shortcut will lose access immediately.`)) return;
    const res = await fetch(`/api/reply-templates/${t.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? 'Could not delete');
      return;
    }
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Reply templates</h3>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Shared org-wide. Agents pull them from the chat input by pressing <code className="font-mono text-[11px] bg-muted px-1 rounded">/</code>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="text-[12px] border border-border-default rounded px-2 py-1 bg-elevated text-text-default focus:outline-none focus:ring-2 focus:ring-brand/15"
          >
            <option value="">All brands</option>
            {state?.brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            + New template
          </Button>
        </div>
      </div>

      {error && <div className="bg-danger-soft border border-danger/20 text-danger text-xs px-3 py-2 rounded-md">{error}</div>}

      <div className="rounded-lg border border-border-default bg-elevated overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-text-muted text-center">Loading…</div>
        ) : templates.length === 0 ? (
          <div className="p-6 text-sm text-text-muted text-center">
            No templates {brandFilter ? `for ${brandNameFor(brandFilter)}` : 'yet'}. Use <strong>+ New template</strong> above.
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {templates.map((t) => (
              <TemplateRow
                key={t.id}
                template={t}
                brandName={brandNameFor(t.brand)}
                editing={editingId === t.id}
                onEditStart={() => setEditingId(t.id)}
                onEditCancel={() => setEditingId(null)}
                onSaved={async () => { setEditingId(null); await load(); }}
                onDelete={() => remove(t)}
              />
            ))}
          </div>
        )}
      </div>

      {createOpen && (
        <CreateTemplateModal
          brands={state?.brands ?? []}
          onClose={() => setCreateOpen(false)}
          onCreated={async () => { setCreateOpen(false); await load(); }}
        />
      )}
    </div>
  );
}

function TemplateRow({
  template,
  brandName,
  editing,
  onEditStart,
  onEditCancel,
  onSaved,
  onDelete,
}: {
  template: Template;
  brandName: string;
  editing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [content, setContent] = useState(template.content);
  const [shortcut, setShortcut] = useState(template.shortcut ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name.trim() !== template.name ||
    content.trim() !== template.content ||
    (shortcut.trim() || null) !== (template.shortcut ?? null);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/reply-templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), content: content.trim(), shortcut: shortcut.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Could not save'); return; }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-primary">{template.name}</span>
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-brand-soft text-brand font-medium">
              {brandName}
            </span>
            {template.shortcut && (
              <code className="text-[10px] font-mono bg-muted text-text-secondary px-1.5 py-0.5 rounded">/{template.shortcut}</code>
            )}
          </div>
          <p className="text-[12px] text-text-secondary mt-1 whitespace-pre-wrap line-clamp-2">{template.content}</p>
          <div className="text-[11px] text-text-muted mt-1">
            Updated {new Date(template.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
        {!editing && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button variant="secondary" size="sm" onClick={onEditStart}>Edit</Button>
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-danger hover:text-danger">Delete</Button>
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-4 pt-4 border-t border-border-subtle space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-text-default mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border-default rounded-md text-sm text-text-default focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-text-default mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-border-default rounded-md text-sm text-text-default focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15 resize-y"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-text-default mb-1">Shortcut (optional)</label>
            <input
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value.replace(/^\//, ''))}
              placeholder="e.g. greeting"
              className="w-full px-3 py-2 border border-border-default rounded-md text-sm text-text-default font-mono focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
            />
          </div>
          {error && <div className="text-[11px] text-danger">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onEditCancel} disabled={busy}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={save} disabled={busy || !dirty || !name.trim() || !content.trim()}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateTemplateModal({
  brands,
  onClose,
  onCreated,
}: {
  brands: OnboardingBrand[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [brand, setBrand] = useState(brands[0]?.id ?? '');
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [shortcut, setShortcut] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!brand) { setError('Pick a brand'); return; }
    if (!name.trim() || !content.trim()) { setError('Name and content are required'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/reply-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand,
          name: name.trim(),
          content: content.trim(),
          shortcut: shortcut.trim(),
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
        className="bg-elevated rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col border border-border-default"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <h2 className="text-base font-semibold text-text-primary">New template</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xl leading-none" aria-label="Close">×</button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">Brand</label>
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
            >
              {brands.length === 0 && <option value="">— No brands available —</option>}
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Greeting"
              className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="Hi! Thanks for reaching out…"
              className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15 resize-y"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">Shortcut (optional)</label>
            <input
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value.replace(/^\//, ''))}
              placeholder="greeting"
              className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default font-mono focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
            />
            <p className="text-[11px] text-text-muted mt-1">
              Agents type <code className="font-mono">/</code> in the chat input to filter by shortcut.
            </p>
          </div>

          {error && (
            <div className="bg-danger-soft border border-danger/20 text-danger text-xs px-3 py-2 rounded-md">
              {error}
            </div>
          )}
        </form>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-default">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={busy || !brand || !name.trim() || !content.trim()}>
            {busy ? 'Creating…' : 'Create template'}
          </Button>
        </div>
      </div>
    </div>
  );
}
