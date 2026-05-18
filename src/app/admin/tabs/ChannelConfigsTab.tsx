'use client';

import { useEffect, useState } from 'react';

interface ChannelRow {
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

const CHANNEL_LABELS: Record<string, string> = { WA: 'WhatsApp', IG: 'Instagram' };
const CHANNEL_TONE: Record<string, string> = {
  WA: 'bg-success-soft text-success border-success/20',
  IG: 'bg-warning-soft text-warning border-warning/20',
};

export default function ChannelConfigsTab() {
  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/brand-channels');
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(data?.error ?? 'Could not load channels');
        else setRows(data);
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
        <h3 className="text-sm font-semibold text-text-primary">Channel configurations</h3>
        <p className="text-[12px] text-text-secondary mt-0.5">
          Every brand+channel currently wired into the inbox. Edit credentials from <a className="text-brand hover:underline" href="/settings">Settings → All channels</a>.
        </p>
      </div>

      {error && (
        <div className="bg-danger-soft border border-danger/20 text-danger text-xs px-3 py-2 rounded-md">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-text-muted py-6 text-center">Loading…</div>
      ) : rows.length === 0 && !error ? (
        <div className="text-sm text-text-muted py-6 text-center">No channels connected yet.</div>
      ) : (
        <div className="rounded-lg border border-border-default bg-elevated overflow-hidden">
          <div className="divide-y divide-border-subtle">
            {rows.map((r) => (
              <div key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-text-primary">{r.brand}</span>
                      <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-medium border ${CHANNEL_TONE[r.channel] ?? 'bg-muted text-text-secondary border-border-default'}`}>
                        {CHANNEL_LABELS[r.channel] ?? r.channel}
                      </span>
                      {r.display_name && (
                        <span className="text-[12px] text-text-secondary truncate">{r.display_name}</span>
                      )}
                    </div>
                    <dl className="text-[11px] text-text-muted mt-2 space-y-0.5">
                      <div className="flex gap-2">
                        <dt className="text-text-secondary min-w-[80px]">Account ID</dt>
                        <dd className="font-mono break-all">{r.external_account_id}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-text-secondary min-w-[80px]">Token</dt>
                        <dd className="font-mono">
                          {r.access_token_preview ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-success" />
                              {r.access_token_preview}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-danger">
                              <span className="w-1.5 h-1.5 rounded-full bg-danger" />
                              Missing
                            </span>
                          )}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-text-secondary min-w-[80px]">Configured</dt>
                        <dd>
                          {new Date(r.configured_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {r.configured_by_name && <> by {r.configured_by_name}</>}
                        </dd>
                      </div>
                      {r.updated_at && r.updated_at !== r.configured_at && (
                        <div className="flex gap-2">
                          <dt className="text-text-secondary min-w-[80px]">Updated</dt>
                          <dd>{new Date(r.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
