'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';

interface Stage {
  id: number;
  name: string;
  sort_order: number | null;
}

interface Pipeline {
  id: number;
  name: string;
  category: string | null;
  stages: Stage[];
}

interface BrandPipelineRow {
  brand: string;
  pipeline_id: number;
  initial_stage_id: number;
  updated_at: string;
  updated_by_name: string | null;
}

interface BrandSettingRow {
  brand: string;
  default_mode: 'AI' | 'HUMAN';
  color: string | null;
  logo_url: string | null;
}

interface OnboardingBrand {
  id: string;
  name: string;
  subtitle: string;
}

interface OnboardingState {
  brands: OnboardingBrand[];
  configured: Array<{ brand: string; channel: string; display_name: string | null }>;
  pipelineError: string | null;
}

// Two sections:
// 1. Brand mappings (editable) — admin assigns each brand to a pipeline + initial stage.
//    Push-to-CRM reads from this before falling back to env vars.
// 2. Pipelines & stages (read-only) — live view from MySQL CRM so admin can
//    pick the right IDs above.
export default function PipelinesTab() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [mappings, setMappings] = useState<BrandPipelineRow[]>([]);
  const [settings, setSettings] = useState<BrandSettingRow[]>([]);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pipelineRes, mappingRes, settingsRes, stateRes] = await Promise.all([
        fetch('/api/admin/pipelines'),
        fetch('/api/admin/brand-pipelines'),
        fetch('/api/admin/brand-settings'),
        fetch('/api/onboarding/state'),
      ]);

      if (!pipelineRes.ok) {
        const data = await pipelineRes.json().catch(() => ({}));
        setError(data?.error ?? 'Could not load pipelines');
      } else {
        const data = await pipelineRes.json();
        setPipelines(data.pipelines ?? []);
      }

      if (mappingRes.ok) setMappings(await mappingRes.json());
      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (stateRes.ok) setState(await stateRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Show one row per brand that has channels configured, even if it has no
  // mapping yet. That way admins can see "this brand needs a pipeline" at a glance.
  const brandRows = useMemo(() => {
    const byBrand = new Map<string, { brand: string; name: string; mapping: BrandPipelineRow | null }>();
    if (state) {
      const configuredBrands = new Set(state.configured.map((c) => c.brand));
      for (const b of state.brands) {
        if (configuredBrands.has(b.id)) {
          byBrand.set(b.id, { brand: b.id, name: b.name, mapping: null });
        }
      }
      // Brand strings present in brand_channels but not in the current CRM
      // pipeline list (e.g. orphaned legacy rows) — keep them visible so an
      // admin can clean them up.
      configuredBrands.forEach((cb) => {
        if (!byBrand.has(cb)) {
          byBrand.set(cb, { brand: cb, name: cb, mapping: null });
        }
      });
    }
    for (const m of mappings) {
      const existing = byBrand.get(m.brand);
      if (existing) {
        existing.mapping = m;
      } else {
        byBrand.set(m.brand, { brand: m.brand, name: m.brand, mapping: m });
      }
    }
    return Array.from(byBrand.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [mappings, state]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Brand → pipeline mapping</h3>
        <p className="text-[12px] text-text-secondary mt-0.5 max-w-xl">
          When a planner clicks <strong>Push to CRM</strong>, we create the deal in the pipeline + stage you assign here.
          Stored in Supabase so changes are instant — no redeploy. Env vars (<code className="font-mono text-[11px] bg-muted px-1 rounded">CRM_PIPELINE_*</code>) are still honoured as a fallback.
        </p>
      </div>

      {error && (
        <div className="bg-danger-soft border border-danger/20 text-danger text-xs px-3 py-2 rounded-md">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border-default bg-elevated overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-text-muted text-center">Loading…</div>
        ) : brandRows.length === 0 ? (
          <div className="p-6 text-sm text-text-muted text-center">
            Connect a brand+channel first from the <strong>Channels</strong> tab — then come back here to assign the pipeline.
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {brandRows.map((br) => {
              const s = settings.find((x) => x.brand === br.brand);
              return (
                <MappingRow
                  key={br.brand}
                  brand={br.brand}
                  brandName={br.name}
                  mapping={br.mapping}
                  pipelines={pipelines}
                  defaultMode={s?.default_mode ?? 'AI'}
                  color={s?.color ?? null}
                  logoUrl={s?.logo_url ?? null}
                  onSaved={load}
                />
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-text-primary mt-8">Pipelines &amp; stages (CRM)</h3>
        <p className="text-[12px] text-text-secondary mt-0.5">
          Read-only view from the MySQL CRM. Use the IDs shown here when mapping brands above.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-text-muted py-6 text-center">Loading from CRM…</div>
      ) : pipelines.length === 0 && !error ? (
        <div className="text-sm text-text-muted py-6 text-center">No active pipelines found.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {pipelines.map((p) => (
            <div key={p.id} className="rounded-lg border border-border-default bg-elevated p-4">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text-primary truncate">{p.name}</div>
                  {p.category && (
                    <div className="text-[11px] text-text-secondary">{p.category}</div>
                  )}
                </div>
                <span className="text-[11px] text-text-muted font-mono whitespace-nowrap" title="Pipeline ID">
                  #{p.id}
                </span>
              </div>
              {p.stages.length === 0 ? (
                <p className="text-[11px] text-text-muted italic">No stages defined.</p>
              ) : (
                <ol className="space-y-1">
                  {p.stages.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-[12px]">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-text-secondary text-[10px] font-mono flex-shrink-0">
                        {s.sort_order ?? '·'}
                      </span>
                      <span className="text-text-default flex-1 truncate">{s.name}</span>
                      <span className="text-[10px] text-text-muted font-mono">#{s.id}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MappingRow({
  brand,
  brandName,
  mapping,
  pipelines,
  defaultMode,
  color,
  logoUrl,
  onSaved,
}: {
  brand: string;
  brandName: string;
  mapping: BrandPipelineRow | null;
  pipelines: Pipeline[];
  defaultMode: 'AI' | 'HUMAN';
  color: string | null;
  logoUrl: string | null;
  onSaved: () => void;
}) {
  const [pipelineId, setPipelineId] = useState<string>(mapping?.pipeline_id ? String(mapping.pipeline_id) : '');
  const [stageId, setStageId] = useState<string>(mapping?.initial_stage_id ? String(mapping.initial_stage_id) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modeBusy, setModeBusy] = useState(false);
  const [modeStatus, setModeStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [modeError, setModeError] = useState<string | null>(null);

  // Local edit state for color + logo so the admin can type freely without
  // hammering the API on every keystroke. Persisted on blur.
  const [colorDraft, setColorDraft] = useState<string>(color ?? '');
  const [logoDraft, setLogoDraft] = useState<string>(logoUrl ?? '');
  const [visualBusy, setVisualBusy] = useState(false);
  const [visualStatus, setVisualStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [visualError, setVisualError] = useState<string | null>(null);

  async function setDefaultMode(next: 'AI' | 'HUMAN') {
    if (next === defaultMode) return;
    setModeBusy(true);
    setModeError(null);
    setModeStatus('idle');
    try {
      const res = await fetch('/api/admin/brand-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, default_mode: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModeError(data?.error ?? 'Could not save default mode');
        setModeStatus('error');
        return;
      }
      setModeStatus('saved');
      onSaved();
    } finally {
      setModeBusy(false);
      // Fade the "Saved" indicator after a moment so the row doesn't shout
      // every time the admin touches the select.
      setTimeout(() => setModeStatus((s) => (s === 'saved' ? 'idle' : s)), 1500);
    }
  }

  async function saveVisuals(patch: { color?: string | null; logo_url?: string | null }) {
    setVisualBusy(true);
    setVisualError(null);
    setVisualStatus('idle');
    try {
      const res = await fetch('/api/admin/brand-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVisualError(data?.error ?? 'Could not save');
        setVisualStatus('error');
        return;
      }
      setVisualStatus('saved');
      onSaved();
    } finally {
      setVisualBusy(false);
      setTimeout(() => setVisualStatus((s) => (s === 'saved' ? 'idle' : s)), 1500);
    }
  }

  const selectedPipeline = pipelines.find((p) => String(p.id) === pipelineId) ?? null;
  const stages = selectedPipeline?.stages ?? [];

  const currentPipeline = pipelines.find((p) => p.id === mapping?.pipeline_id);
  const currentStage = currentPipeline?.stages.find((s) => s.id === mapping?.initial_stage_id);

  const dirty =
    String(mapping?.pipeline_id ?? '') !== pipelineId ||
    String(mapping?.initial_stage_id ?? '') !== stageId;

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/brand-pipelines', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand,
          pipeline_id: Number(pipelineId),
          initial_stage_id: Number(stageId),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Could not save'); return; }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function clearMapping() {
    if (!confirm(`Clear pipeline mapping for "${brandName}"? Push-to-CRM will fall back to env vars / numeric brand id.`)) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/brand-pipelines?brand=${encodeURIComponent(brand)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Could not clear'); return; }
      setPipelineId('');
      setStageId('');
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-primary">{brandName}</div>
          {mapping ? (
            <div className="text-[11px] text-text-secondary mt-0.5">
              Currently: {currentPipeline?.name ?? `pipeline #${mapping.pipeline_id}`} →{' '}
              {currentStage?.name ?? `stage #${mapping.initial_stage_id}`}
              {mapping.updated_by_name && ` · set by ${mapping.updated_by_name}`}
            </div>
          ) : (
            <div className="text-[11px] text-warning mt-0.5">
              Not mapped — push-to-CRM falls back to env vars for this brand.
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[11px] font-medium text-text-secondary whitespace-nowrap">
            Default mode for new conversations
          </label>
          <select
            value={defaultMode}
            onChange={(e) => setDefaultMode(e.target.value as 'AI' | 'HUMAN')}
            disabled={modeBusy}
            className="text-xs border border-border-default rounded px-2 py-1 bg-elevated text-text-default focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:opacity-50"
            title="Mode each new inbound conversation starts in for this brand, on every channel"
          >
            <option value="AI">AI</option>
            <option value="HUMAN">Human</option>
          </select>
          {modeBusy && <span className="text-[11px] text-text-muted">Saving…</span>}
          {modeStatus === 'saved' && !modeBusy && <span className="text-[11px] text-success">Saved</span>}
          {modeError && <span className="text-[11px] text-danger" title={modeError}>Failed</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
        <div>
          <label className="block text-[11px] font-medium text-text-secondary mb-1">Pipeline</label>
          <select
            value={pipelineId}
            onChange={(e) => { setPipelineId(e.target.value); setStageId(''); }}
            disabled={busy || pipelines.length === 0}
            className="w-full text-xs border border-border-default rounded px-2 py-1.5 bg-elevated text-text-default focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:opacity-50"
          >
            <option value="">— Select pipeline —</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.name} (#{p.id})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-text-secondary mb-1">Initial stage</label>
          <select
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
            disabled={busy || stages.length === 0}
            className="w-full text-xs border border-border-default rounded px-2 py-1.5 bg-elevated text-text-default focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:opacity-50"
          >
            <option value="">{stages.length === 0 ? '— pick a pipeline first —' : '— Select stage —'}</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name} (#{s.id})</option>
            ))}
          </select>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={save}
          disabled={busy || !dirty || !pipelineId || !stageId}
        >
          {busy ? 'Saving…' : mapping ? 'Update' : 'Save'}
        </Button>

        {mapping && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearMapping}
            disabled={busy}
            className="text-danger hover:text-danger"
          >
            Clear
          </Button>
        )}
      </div>

      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}

      <div className="mt-4 pt-3 border-t border-border-subtle">
        <div className="text-[11px] font-medium text-text-secondary mb-2">Brand chip in the inbox rail</div>
        <div className="flex items-center gap-3 flex-wrap">
          <ChipPreview name={brandName} color={colorDraft || color} logoUrl={logoDraft || logoUrl} />

          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-text-muted">Color</label>
            <input
              type="color"
              value={colorDraft && /^#[0-9a-f]{6}$/i.test(colorDraft) ? colorDraft : '#7c3aed'}
              onChange={(e) => setColorDraft(e.target.value)}
              onBlur={() => {
                const next = colorDraft.trim();
                if ((next || null) !== (color ?? null)) saveVisuals({ color: next || null });
              }}
              disabled={visualBusy}
              className="w-7 h-7 rounded border border-border-default cursor-pointer disabled:opacity-50"
              aria-label="Brand color"
            />
            {colorDraft && (
              <button
                type="button"
                onClick={() => { setColorDraft(''); saveVisuals({ color: null }); }}
                disabled={visualBusy}
                className="text-[10px] text-text-muted hover:text-danger"
                title="Clear color"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
            <label className="text-[11px] text-text-muted whitespace-nowrap">Logo URL</label>
            <input
              type="url"
              value={logoDraft}
              onChange={(e) => setLogoDraft(e.target.value)}
              onBlur={() => {
                const next = logoDraft.trim();
                if ((next || null) !== (logoUrl ?? null)) saveVisuals({ logo_url: next || null });
              }}
              disabled={visualBusy}
              placeholder="https://…/logo.png"
              className="flex-1 text-xs border border-border-default rounded px-2 py-1 bg-elevated text-text-default focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:opacity-50"
            />
          </div>

          {visualBusy && <span className="text-[11px] text-text-muted">Saving…</span>}
          {visualStatus === 'saved' && !visualBusy && <span className="text-[11px] text-success">Saved</span>}
          {visualError && <span className="text-[11px] text-danger" title={visualError}>Failed</span>}
        </div>
      </div>
    </div>
  );
}

function ChipPreview({
  name,
  color,
  logoUrl,
}: {
  name: string;
  color: string | null;
  logoUrl: string | null;
}) {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length >= 2 ? parts.map((p) => p[0]).join('').slice(0, 3).toUpperCase() : name.slice(0, 3).toUpperCase();
  const style = color ? { backgroundColor: color, color: '#fff' } : undefined;
  return (
    <div className="flex items-center gap-2">
      <div
        style={style}
        className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold overflow-hidden ${color ? '' : 'bg-muted text-text-secondary'}`}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </div>
      <span className="text-[11px] text-text-muted">Preview</span>
    </div>
  );
}
