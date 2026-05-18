'use client';

import { useEffect, useState } from 'react';

interface EnvKey { key: string; set: boolean }
interface EnvGroup { group: string; keys: EnvKey[] }
interface ConnStatus { ok: boolean; latencyMs: number; error: string | null }

interface SystemData {
  env: EnvGroup[];
  supabase: ConnStatus;
  crm: ConnStatus;
  runtime: { node: string; env: string; region: string | null };
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
      ok ? 'bg-success-soft text-success border-success/20' : 'bg-danger-soft text-danger border-danger/20'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-success' : 'bg-danger'}`} />
      {label}
    </span>
  );
}

export default function SystemTab() {
  const [data, setData] = useState<SystemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/system');
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(json?.error ?? 'Could not load system status');
        else setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="text-sm text-text-muted py-6 text-center">Probing…</div>;
  if (error) return <div className="bg-danger-soft border border-danger/20 text-danger text-xs px-3 py-2 rounded-md">{error}</div>;
  if (!data) return null;

  const missingCount = data.env.reduce((acc, g) => acc + g.keys.filter((k) => !k.set).length, 0);

  return (
    <div className="space-y-6">
      {/* Runtime + connectivity */}
      <div className="rounded-lg border border-border-default bg-elevated p-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <h3 className="text-sm font-semibold text-text-primary">Runtime &amp; connectivity</h3>
          <div className="flex flex-wrap gap-1.5">
            <StatusPill ok={data.supabase.ok} label={`Supabase ${data.supabase.ok ? `${data.supabase.latencyMs}ms` : 'down'}`} />
            <StatusPill ok={data.crm.ok} label={`MySQL CRM ${data.crm.ok ? `${data.crm.latencyMs}ms` : 'down'}`} />
          </div>
        </div>
        <dl className="text-[12px] space-y-1">
          <div className="flex gap-2">
            <dt className="text-text-secondary min-w-[100px]">Environment</dt>
            <dd className="text-text-default font-mono">{data.runtime.env}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-text-secondary min-w-[100px]">Node</dt>
            <dd className="text-text-default font-mono">{data.runtime.node}</dd>
          </div>
          {data.runtime.region && (
            <div className="flex gap-2">
              <dt className="text-text-secondary min-w-[100px]">Region</dt>
              <dd className="text-text-default font-mono">{data.runtime.region}</dd>
            </div>
          )}
        </dl>
        {!data.supabase.ok && data.supabase.error && (
          <p className="mt-2 text-[11px] text-danger">Supabase error: {data.supabase.error}</p>
        )}
        {!data.crm.ok && data.crm.error && (
          <p className="mt-2 text-[11px] text-danger">CRM error: {data.crm.error}</p>
        )}
      </div>

      {/* Env vars */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Environment variables</h3>
            <p className="text-[12px] text-text-secondary mt-0.5">
              Presence only — values are never read by this endpoint.
            </p>
          </div>
          {missingCount > 0 && (
            <span className="text-[11px] text-warning font-medium">
              {missingCount} missing
            </span>
          )}
        </div>

        <div className="space-y-3">
          {data.env.map((g) => (
            <div key={g.group} className="rounded-lg border border-border-default bg-elevated overflow-hidden">
              <div className="px-4 py-2 border-b border-border-subtle text-[12px] font-semibold text-text-primary">
                {g.group}
              </div>
              <div className="divide-y divide-border-subtle">
                {g.keys.map((k) => (
                  <div key={k.key} className="px-4 py-2 flex items-center justify-between gap-3">
                    <code className="text-[12px] font-mono text-text-default break-all">{k.key}</code>
                    <StatusPill ok={k.set} label={k.set ? 'set' : 'missing'} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
