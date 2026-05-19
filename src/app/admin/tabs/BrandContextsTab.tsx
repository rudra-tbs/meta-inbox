'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';

interface ContextRow {
  brand: string;
  system_prompt: string;
  updated_at: string;
  updated_by_name: string | null;
}

interface ContextResponse {
  contexts: ContextRow[];
  default_prompt: string;
}

interface PipelineBrand {
  id: string;
  name: string;
  subtitle: string;
}

export default function BrandContextsTab() {
  const [contexts, setContexts] = useState<ContextRow[]>([]);
  const [defaultPrompt, setDefaultPrompt] = useState<string>('');
  const [pipelineBrands, setPipelineBrands] = useState<PipelineBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingBrand, setEditingBrand] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ctxRes, stateRes] = await Promise.all([
        fetch('/api/brand-contexts'),
        fetch('/api/onboarding/state'),
      ]);
      if (!ctxRes.ok) {
        const data = await ctxRes.json().catch(() => ({}));
        setError(data?.error ?? 'Could not load brand contexts');
        return;
      }
      const ctxData = (await ctxRes.json()) as ContextResponse;
      setContexts(ctxData.contexts);
      setDefaultPrompt(ctxData.default_prompt);

      if (stateRes.ok) {
        const stateData = await stateRes.json();
        setPipelineBrands(stateData.brands ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Merge known brands from the CRM pipelines with brands that already have
  // custom contexts saved. Some saved contexts may reference brand IDs that
  // aren't in the current CRM (orphaned rows) — we still show them so the
  // admin can edit or remove the row.
  const rows = useMemo(() => {
    const byBrand = new Map<string, { brand: string; name: string; subtitle: string; ctx: ContextRow | null }>();
    for (const b of pipelineBrands) {
      byBrand.set(b.id, { brand: b.id, name: b.name, subtitle: b.subtitle, ctx: null });
    }
    for (const c of contexts) {
      const existing = byBrand.get(c.brand);
      if (existing) {
        existing.ctx = c;
      } else {
        byBrand.set(c.brand, { brand: c.brand, name: c.brand, subtitle: 'Legacy brand (not in current CRM)', ctx: c });
      }
    }
    return Array.from(byBrand.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [pipelineBrands, contexts]);

  if (loading) {
    return <div className="text-sm text-text-muted py-8 text-center">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Per-brand AI context</h3>
        <p className="text-[12px] text-text-secondary mt-0.5 max-w-xl">
          Every inbound message is sent to the AI with a brand-specific system prompt. If a brand has no custom
          prompt below, the AI falls back to the default. Edit a prompt to change how the AI behaves for that
          brand — its tone, what it asks, when it hands off to your team.
        </p>
      </div>

      {error && <div className="bg-danger-soft border border-danger/20 text-danger text-xs px-3 py-2 rounded-md">{error}</div>}

      <div className="rounded-lg border border-border-default bg-elevated overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-6 text-sm text-text-muted text-center">
            No brands found yet. Run the signup flow to connect a brand first.
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {rows.map((r) => (
              <BrandContextRow
                key={r.brand}
                brand={r.brand}
                name={r.name}
                subtitle={r.subtitle}
                ctx={r.ctx}
                defaultPrompt={defaultPrompt}
                editing={editingBrand === r.brand}
                onEditStart={() => setEditingBrand(r.brand)}
                onEditCancel={() => setEditingBrand(null)}
                onSaved={async () => { setEditingBrand(null); await load(); }}
                onReset={async () => { setEditingBrand(null); await load(); }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BrandContextRow({
  brand,
  name,
  subtitle,
  ctx,
  defaultPrompt,
  editing,
  onEditStart,
  onEditCancel,
  onSaved,
  onReset,
}: {
  brand: string;
  name: string;
  subtitle: string;
  ctx: ContextRow | null;
  defaultPrompt: string;
  editing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onSaved: () => void;
  onReset: () => void;
}) {
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-primary">{name}</span>
            {ctx ? (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-success-soft text-success font-medium">
                Custom
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-text-secondary font-medium">
                Default
              </span>
            )}
          </div>
          <div className="text-[11px] text-text-secondary mt-0.5">{subtitle}</div>
          {ctx && (
            <div className="text-[11px] text-text-muted mt-1">
              Last edited {new Date(ctx.updated_at).toLocaleDateString()} by {ctx.updated_by_name ?? 'unknown'} ·
              {' '}{ctx.system_prompt.length} chars
            </div>
          )}
        </div>
        {!editing && (
          <Button variant="secondary" size="sm" onClick={onEditStart}>
            {ctx ? 'Edit' : 'Customize'}
          </Button>
        )}
      </div>

      {editing && (
        <div className="mt-4 pt-4 border-t border-border-subtle">
          <Editor
            brand={brand}
            initial={ctx?.system_prompt ?? defaultPrompt}
            defaultPrompt={defaultPrompt}
            hasCustom={!!ctx}
            onCancel={onEditCancel}
            onSaved={onSaved}
            onReset={onReset}
          />
        </div>
      )}
    </div>
  );
}

function Editor({
  brand,
  initial,
  defaultPrompt,
  hasCustom,
  onCancel,
  onSaved,
  onReset,
}: {
  brand: string;
  initial: string;
  defaultPrompt: string;
  hasCustom: boolean;
  onCancel: () => void;
  onSaved: () => void;
  onReset: () => void;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = text !== initial;
  const tooLong = text.length > 20000;

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/brand-contexts/${encodeURIComponent(brand)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system_prompt: text }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Could not save'); return; }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!confirm('Reset to the default prompt? Your custom prompt for this brand will be deleted.')) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/brand-contexts/${encodeURIComponent(brand)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Could not reset'); return; }
      onReset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[12px] font-medium text-text-default">System prompt</label>
        <button
          type="button"
          onClick={() => setText(defaultPrompt)}
          className="text-[11px] text-brand hover:underline"
          disabled={busy}
        >
          Load default
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={18}
        spellCheck={false}
        className="w-full px-3 py-2 border border-border-default rounded-md text-[12px] font-mono leading-relaxed text-text-default focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15 resize-y"
      />

      <div className="flex items-center justify-between text-[11px]">
        <span className={tooLong ? 'text-danger' : 'text-text-muted'}>
          {text.length.toLocaleString()} / 20,000 characters
        </span>
        {error && <span className="text-danger">{error}</span>}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          {hasCustom && (
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy} className="text-danger hover:text-danger">
              Delete custom prompt
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={save} disabled={!dirty || busy || tooLong}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
