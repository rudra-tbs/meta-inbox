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
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pipelineRes, mappingRes, stateRes] = await Promise.all([
        fetch('/api/admin/pipelines'),
        fetch('/api/admin/brand-pipelines'),
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
            {brandRows.map((br) => (
              <MappingRow
                key={br.brand}
                brand={br.brand}
                brandName={br.name}
                mapping={br.mapping}
                pipelines={pipelines}
                onSaved={load}
              />
            ))}
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
  onSaved,
}: {
  brand: string;
  brandName: string;
  mapping: BrandPipelineRow | null;
  pipelines: Pipeline[];
  onSaved: () => void;
}) {
  const [pipelineId, setPipelineId] = useState<string>(mapping?.pipeline_id ? String(mapping.pipeline_id) : '');
  const [stageId, setStageId] = useState<string>(mapping?.initial_stage_id ? String(mapping.initial_stage_id) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    </div>
  );
}
