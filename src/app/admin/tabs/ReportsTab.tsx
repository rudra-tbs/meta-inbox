'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface ReportData {
  window: { from: string; to: string; days: number };
  filters: { brand: string | null; agent: string | null };
  totals: {
    conversations: number;
    qualified: number;
    pushed_to_crm: number;
    handed_off: number;
    ai_only: number;
  };
  rates: {
    qualification: number;
    handoff: number;
    crm_push_of_qualified: number;
  };
  response_time: {
    ai:    { sample: number; p50_ms: number | null; p95_ms: number | null };
    human: { sample: number; p50_ms: number | null; p95_ms: number | null };
  };
  daily: Array<{ date: string; total: number; qualified: number; pushed: number }>;
  by_brand: Array<{ brand: string; name: string; total: number; qualified: number; pushed: number; handed: number }>;
  by_agent: Array<{ user_id: string; name: string; human_replies: number; assigned: number; pushed: number }>;
  notes: string[];
}

interface AssignableUser { id: string; name: string }

const WINDOW_OPTIONS: Array<{ days: number; label: string }> = [
  { days: 7,  label: 'Last 7 days'  },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3600_000).toFixed(1)}h`;
}

export default function ReportsTab() {
  const [days, setDays] = useState(30);
  const [brand, setBrand] = useState<string>('');
  const [agent, setAgent] = useState<string>('');
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [agents, setAgents] = useState<AssignableUser[]>([]);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Brand + agent dropdowns. Reuse the same endpoints the inbox uses.
  useEffect(() => {
    fetch('/api/brands').then((r) => r.ok ? r.json() : []).then(setBrands).catch(() => {});
    fetch('/api/users?assignable=true').then((r) => r.ok ? r.json() : []).then(setAgents).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (brand) params.set('brand', brand);
      if (agent) params.set('agent', agent);
      const res = await fetch(`/api/admin/reports?${params.toString()}`);
      const body = await res.json();
      if (!res.ok) { setError(body?.error ?? 'Could not load reports'); return; }
      setData(body);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [days, brand, agent]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Reports</h3>
        <p className="text-[12px] text-text-secondary mt-0.5 max-w-xl">
          Conversation volume, qualification rate, response time, and CRM conversion across the selected window. All times are computed from message timestamps; admins-only.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
          {WINDOW_OPTIONS.map((o) => (
            <button
              key={o.days}
              type="button"
              onClick={() => setDays(o.days)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                days === o.days ? 'bg-elevated text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <select
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="border border-border-default rounded px-2 py-1 bg-elevated text-text-default focus:outline-none focus:ring-2 focus:ring-brand/15"
        >
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          className="border border-border-default rounded px-2 py-1 bg-elevated text-text-default focus:outline-none focus:ring-2 focus:ring-brand/15"
        >
          <option value="">All agents</option>
          {agents.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        {(brand || agent) && (
          <button
            type="button"
            onClick={() => { setBrand(''); setAgent(''); }}
            className="text-[11px] text-text-secondary hover:text-text-primary"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <div className="bg-danger-soft border border-danger/20 text-danger text-xs px-3 py-2 rounded-md">{error}</div>}

      {loading ? (
        <div className="text-sm text-text-muted py-10 text-center">Loading…</div>
      ) : !data ? null : data.totals.conversations === 0 ? (
        <div className="rounded-lg border border-border-default bg-elevated p-8 text-center">
          <div className="text-sm font-medium text-text-primary">No conversations in this window</div>
          <p className="text-[12px] text-text-secondary mt-1">
            Try a wider window or clear the brand / agent filter.
          </p>
        </div>
      ) : (
        <>
          {data.notes.map((n, i) => (
            <div key={i} className="bg-warning-soft border border-warning/20 text-warning text-[11px] px-3 py-2 rounded-md">{n}</div>
          ))}

          {/* Top-line metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Conversations" value={data.totals.conversations.toLocaleString()} sub={`in ${data.window.days} days`} />
            <MetricCard label="Qualified" value={data.totals.qualified.toLocaleString()} sub={fmtPct(data.rates.qualification) + ' qualification rate'} />
            <MetricCard label="Pushed to CRM" value={data.totals.pushed_to_crm.toLocaleString()} sub={fmtPct(data.rates.crm_push_of_qualified) + ' of qualified'} />
            <MetricCard label="Handed off to human" value={data.totals.handed_off.toLocaleString()} sub={fmtPct(data.rates.handoff) + ' handoff rate'} />
          </div>

          {/* Response time */}
          <div className="rounded-lg border border-border-default bg-elevated overflow-hidden">
            <div className="px-4 py-3 border-b border-border-default">
              <div className="text-sm font-semibold text-text-primary">Response time</div>
              <div className="text-[11px] text-text-secondary mt-0.5">Time from first inbound message to the first reply on that conversation.</div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border-subtle">
              <ResponseStat label="AI"    p50={data.response_time.ai.p50_ms}    p95={data.response_time.ai.p95_ms}    sample={data.response_time.ai.sample} />
              <ResponseStat label="Human" p50={data.response_time.human.p50_ms} p95={data.response_time.human.p95_ms} sample={data.response_time.human.sample} />
            </div>
          </div>

          {/* Daily volume sparkline */}
          <DailyChart daily={data.daily} />

          {/* Per-brand */}
          <BreakdownTable
            title="By brand"
            rows={data.by_brand.map((r) => ({
              key: r.brand,
              cells: [r.name, r.total, r.qualified, r.handed, r.pushed],
            }))}
            headers={['Brand', 'Conversations', 'Qualified', 'Handed off', 'Pushed']}
          />

          {/* Per-agent */}
          {data.by_agent.length > 0 && (
            <BreakdownTable
              title="By agent"
              rows={data.by_agent.map((r) => ({
                key: r.user_id,
                cells: [r.name, r.human_replies, r.assigned, r.pushed],
              }))}
              headers={['Agent', 'Human replies', 'Assigned', 'Pushed to CRM']}
            />
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border-default bg-elevated p-4">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-text-muted">{label}</div>
      <div className="text-2xl font-bold text-text-primary tabular-nums mt-1">{value}</div>
      <div className="text-[11px] text-text-secondary mt-1.5 leading-snug">{sub}</div>
    </div>
  );
}

function ResponseStat({ label, p50, p95, sample }: { label: string; p50: number | null; p95: number | null; sample: number }) {
  return (
    <div className="p-4">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-text-muted mb-2">{label}</div>
      <div className="flex items-baseline gap-5">
        <div>
          <div className="text-lg font-bold text-text-primary tabular-nums">{fmtDuration(p50)}</div>
          <div className="text-[10px] text-text-muted">p50</div>
        </div>
        <div>
          <div className="text-lg font-bold text-text-primary tabular-nums">{fmtDuration(p95)}</div>
          <div className="text-[10px] text-text-muted">p95</div>
        </div>
        <div className="ml-auto text-[10px] text-text-muted">{sample} convs</div>
      </div>
    </div>
  );
}

function DailyChart({ daily }: { daily: Array<{ date: string; total: number; qualified: number; pushed: number }> }) {
  const max = useMemo(() => Math.max(1, ...daily.map((d) => d.total)), [daily]);
  return (
    <div className="rounded-lg border border-border-default bg-elevated p-4">
      <div className="text-sm font-semibold text-text-primary mb-2">Daily volume</div>
      <div className="flex items-end gap-0.5 h-24">
        {daily.map((d) => {
          const totalH = (d.total / max) * 100;
          const qualH  = (d.qualified / max) * 100;
          const pushH  = (d.pushed / max) * 100;
          return (
            <div key={d.date} className="flex-1 flex flex-col justify-end relative group" title={`${d.date} · ${d.total} convs · ${d.qualified} qualified · ${d.pushed} pushed`}>
              <div className="absolute bottom-0 left-0 right-0 bg-brand/15"  style={{ height: `${totalH}%` }} />
              <div className="absolute bottom-0 left-0 right-0 bg-brand/45"  style={{ height: `${qualH}%`  }} />
              <div className="absolute bottom-0 left-0 right-0 bg-brand"     style={{ height: `${pushH}%`  }} />
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-text-muted">
        <Legend color="bg-brand/15" label="Total" />
        <Legend color="bg-brand/45" label="Qualified" />
        <Legend color="bg-brand"    label="Pushed" />
        <span className="ml-auto">{daily[0]?.date} → {daily[daily.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function BreakdownTable({ title, headers, rows }: {
  title: string;
  headers: string[];
  rows: Array<{ key: string; cells: Array<string | number> }>;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-elevated overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border-default text-sm font-semibold text-text-primary">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-canvas">
            <tr>
              {headers.map((h, i) => (
                <th key={h} className={`px-4 py-2 font-medium text-text-secondary text-${i === 0 ? 'left' : 'right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {rows.map((r) => (
              <tr key={r.key}>
                {r.cells.map((cell, i) => (
                  <td key={i} className={`px-4 py-2 ${i === 0 ? 'text-text-default' : 'text-text-primary text-right tabular-nums font-medium'}`}>
                    {typeof cell === 'number' ? cell.toLocaleString() : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
