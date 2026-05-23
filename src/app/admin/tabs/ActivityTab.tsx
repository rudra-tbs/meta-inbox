'use client';

import { useCallback, useEffect, useState } from 'react';

interface AdminEvent {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  event_type: string;
  target_kind: string;
  target_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any>;
  created_at: string;
}

interface EventsResponse {
  events: AdminEvent[];
  migration_missing: boolean;
}

const EVENT_LABELS: Record<string, string> = {
  USER_INVITED: 'Invited user',
  USER_DELETED: 'Deleted user',
  USER_ACTIVATED: 'Reactivated user',
  USER_DEACTIVATED: 'Deactivated user',
  ROLE_CHANGED: 'Changed role',
  ACCESS_UPDATED: 'Updated access',
  CHANNEL_CONNECTED: 'Connected channel',
  CHANNEL_UPDATED: 'Updated channel',
  CHANNEL_DISCONNECTED: 'Disconnected channel',
  PIPELINE_MAPPED: 'Set pipeline mapping',
  PIPELINE_UNMAPPED: 'Cleared pipeline mapping',
  BRAND_CONTEXT_UPDATED: 'Updated brand context',
  BRAND_CONTEXT_DELETED: 'Removed brand context',
  BRAND_SETTINGS_CASCADED: 'Cleared brand settings (last channel removed)',
  TEMPLATE_CREATED: 'Created template',
  TEMPLATE_UPDATED: 'Updated template',
  TEMPLATE_DELETED: 'Deleted template',
};

const TARGET_TONE: Record<string, string> = {
  user: 'bg-brand-soft text-brand border-brand/20',
  channel: 'bg-success-soft text-success border-success/20',
  brand_pipeline: 'bg-warning-soft text-warning border-warning/20',
  brand_context: 'bg-canvas text-text-secondary border-border-default',
  brand_setting: 'bg-canvas text-text-secondary border-border-default',
  reply_template: 'bg-canvas text-text-default border-border-default',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describe(event: AdminEvent): string {
  const m = event.metadata ?? {};
  const target = m.target_name ?? m.target_email ?? '';
  switch (event.event_type) {
    case 'USER_INVITED':
      return `${target || 'user'} (${m.role}${m.access_count ? `, ${m.access_count} access rows` : ''})`;
    case 'USER_DELETED':
      return `${target || 'user'} (${m.target_role})`;
    case 'USER_ACTIVATED':
    case 'USER_DEACTIVATED':
      return target || 'user';
    case 'ROLE_CHANGED':
      return `${target} · ${m.from} → ${m.to}`;
    case 'ACCESS_UPDATED':
      return `${target} · ${m.count} brand·channel${m.count === 1 ? '' : 's'}`;
    case 'CHANNEL_CONNECTED':
      return `${m.brand} · ${m.channel}${m.display_name ? ` (${m.display_name})` : ''}`;
    case 'CHANNEL_UPDATED':
      return `${m.brand} · ${m.channel} · ${(m.changed ?? []).join(', ')}`;
    case 'CHANNEL_DISCONNECTED':
      return `${m.brand} · ${m.channel}${m.display_name ? ` (${m.display_name})` : ''}`;
    case 'PIPELINE_MAPPED':
      return `pipeline #${m.pipeline_id} · initial stage #${m.initial_stage_id}`;
    case 'PIPELINE_UNMAPPED':
      return '—';
    case 'BRAND_CONTEXT_UPDATED':
      return `${m.length ?? 0} chars`;
    case 'BRAND_CONTEXT_DELETED':
      return '—';
    case 'BRAND_SETTINGS_CASCADED':
      return `brand ${m.brand}`;
    case 'TEMPLATE_CREATED':
    case 'TEMPLATE_UPDATED':
    case 'TEMPLATE_DELETED':
      return `${m.brand}${m.name ? ` · ${m.name}` : ''}${m.shortcut ? ` (/${m.shortcut})` : ''}`;
    default:
      return target;
  }
}

export default function ActivityTab() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [kindFilter, setKindFilter] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (kindFilter) params.set('target_kind', kindFilter);
      const res = await fetch(`/api/admin/events?${params.toString()}`);
      const data = (await res.json()) as EventsResponse | { error: string };
      if (!res.ok) {
        setError((data as { error: string }).error ?? 'Could not load activity');
        return;
      }
      const ev = data as EventsResponse;
      setEvents(ev.events);
      setMigrationMissing(ev.migration_missing);
    } finally {
      setLoading(false);
    }
  }, [kindFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Admin activity</h3>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Every admin-side mutation — invites, role changes, deactivations, access edits. Use it to investigate who did what and when.
          </p>
        </div>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          className="text-[12px] border border-border-default rounded px-2 py-1 bg-elevated text-text-default focus:outline-none focus:ring-2 focus:ring-brand/15"
        >
          <option value="">All targets</option>
          <option value="user">Users</option>
          <option value="channel">Channels</option>
          <option value="brand_pipeline">Pipelines</option>
          <option value="brand_context">Brand contexts</option>
          <option value="reply_template">Templates</option>
        </select>
      </div>

      {error && <div className="bg-danger-soft border border-danger/20 text-danger text-xs px-3 py-2 rounded-md">{error}</div>}

      {migrationMissing && (
        <div className="bg-warning-soft border border-warning/20 text-warning text-xs px-3 py-2 rounded-md">
          The <code className="font-mono">admin_events</code> table doesn&apos;t exist yet — run <code className="font-mono">migrations/2026_05_admin_events.sql</code> in Supabase.
        </div>
      )}

      <div className="rounded-lg border border-border-default bg-elevated overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-text-muted text-center">Loading…</div>
        ) : events.length === 0 && !migrationMissing ? (
          <div className="p-6 text-sm text-text-muted text-center">
            No activity recorded {kindFilter ? `for ${kindFilter}` : 'yet'}.
          </div>
        ) : events.length === 0 ? null : (
          <ol className="divide-y divide-border-subtle">
            {events.map((e) => (
              <li key={e.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-semibold text-text-primary">
                        {EVENT_LABELS[e.event_type] ?? e.event_type}
                      </span>
                      <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-medium border ${TARGET_TONE[e.target_kind] ?? 'bg-muted text-text-secondary border-border-default'}`}>
                        {e.target_kind}
                      </span>
                      <span className="text-[11px] text-text-default truncate">
                        {describe(e)}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      by {e.actor_name ?? e.actor_email ?? 'unknown'}
                    </div>
                  </div>
                  <span className="text-[11px] text-text-muted whitespace-nowrap" title={new Date(e.created_at).toLocaleString('en-IN')}>
                    {timeAgo(e.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
