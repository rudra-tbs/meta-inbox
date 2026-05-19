'use client';

import { useEffect, useState } from 'react';

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

export default function PipelinesTab() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/pipelines');
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error ?? 'Could not load pipelines');
        } else {
          setPipelines(data.pipelines ?? []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">CRM Pipelines</h3>
        <p className="text-[12px] text-text-secondary mt-0.5">
          Live view of active pipelines + stages from the MySQL CRM (read-only). The pipeline ID is what gets stored as <code className="font-mono text-[11px] bg-muted px-1 rounded">conversations.brand</code> when a deal is pushed.
        </p>
      </div>

      {error && (
        <div className="bg-danger-soft border border-danger/20 text-danger text-xs px-3 py-2 rounded-md">
          {error}
        </div>
      )}

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
