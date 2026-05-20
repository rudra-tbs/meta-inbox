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

  // Preview state — admins paste a sample lead message, click Run, see the
  // actual AI output against the *unsaved* draft prompt so they can iterate
  // without shipping bad prompts to real conversations.
  const [sampleMessage, setSampleMessage] = useState('Hi, mujhe apni shaadi plan karwani hai');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    raw: string;
    clean_text: string | null;
    qual_data: Record<string, unknown> | null;
    abstained: boolean;
    latency_ms: number;
  } | null>(null);

  const dirty = text !== initial;
  const tooLong = text.length > 20000;

  async function runPreview() {
    setPreviewError(null);
    setPreview(null);
    setPreviewBusy(true);
    try {
      const res = await fetch('/api/admin/brand-contexts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system_prompt: text, user_message: sampleMessage }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreviewError(data?.error ?? 'Preview failed');
        return;
      }
      setPreview(data);
    } catch {
      setPreviewError('Network error');
    } finally {
      setPreviewBusy(false);
    }
  }

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

      {/* Preview: dry-run the current draft prompt against a sample message
          without saving. Hits the LLM each click so token cost is real, but
          much cheaper than shipping a bad prompt to live leads. */}
      <div className="rounded-lg border border-border-default bg-canvas p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold text-text-primary">Preview</div>
          <span className="text-[10px] text-text-muted">runs the unsaved draft above</span>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-text-secondary mb-1">Sample lead message</label>
          <textarea
            value={sampleMessage}
            onChange={(e) => setSampleMessage(e.target.value)}
            rows={2}
            className="w-full text-[12px] px-2.5 py-1.5 border border-border-default rounded bg-elevated text-text-default focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
            placeholder="e.g. Hi, mujhe apni shaadi plan karwani hai"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={runPreview}
            disabled={previewBusy || !sampleMessage.trim() || tooLong}
          >
            {previewBusy ? 'Running…' : 'Run preview'}
          </Button>
          {preview && !previewBusy && (
            <span className="text-[10px] text-text-muted">
              {preview.latency_ms}ms · {preview.abstained ? 'ABSTAIN' : preview.qual_data?.is_qualified ? 'Qualified ✓' : 'Not yet qualified'}
            </span>
          )}
        </div>

        {previewError && (
          <div className="bg-danger-soft border border-danger/20 text-danger text-[11px] px-2.5 py-1.5 rounded">
            {previewError}
          </div>
        )}

        {preview && (
          <div className="space-y-2 pt-2 border-t border-border-subtle">
            {preview.abstained ? (
              <div className="bg-warning-soft border border-warning/20 text-warning text-[12px] px-3 py-2 rounded">
                AI returned <strong>ABSTAIN</strong> — would escalate to human without sending anything.
              </div>
            ) : (
              <>
                <div>
                  <div className="text-[10px] font-medium text-text-secondary mb-1">Reply the lead would see</div>
                  <div className="bg-brand-tint text-text-primary text-[12px] rounded-md px-3 py-2 leading-relaxed whitespace-pre-wrap">
                    {preview.clean_text || <span className="text-text-muted italic">empty reply</span>}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium text-text-secondary mb-1">Parsed qualification_data</div>
                  <pre className="bg-elevated border border-border-default text-text-default text-[11px] font-mono rounded-md px-3 py-2 overflow-x-auto leading-snug">
{preview.qual_data ? JSON.stringify(preview.qual_data, null, 2) : '— none —'}
                  </pre>
                </div>
              </>
            )}
            <details className="text-[10px] text-text-muted">
              <summary className="cursor-pointer hover:text-text-secondary">Raw LLM output</summary>
              <pre className="mt-1.5 bg-elevated border border-border-default text-text-default text-[10px] font-mono rounded p-2 overflow-x-auto whitespace-pre-wrap">
{preview.raw}
              </pre>
            </details>
          </div>
        )}
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
