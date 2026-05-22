'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import { useFocusTrap } from '@/lib/use-focus-trap';

interface BrandChannelRow {
  id: string;
  brand: string;
  channel: string;
  external_account_id: string;
  display_name: string | null;
  configured_at: string;
  updated_at: string;
  configured_by_name: string | null;
  configured_by_email: string | null;
  token_env_suffix: string;
  token_env_key: string;
  token_env_set: boolean;
}

interface OnboardingBrand { id: string; name: string; subtitle: string }
interface OnboardingState {
  brands: OnboardingBrand[];
  configured: Array<{ brand: string; channel: string; display_name: string | null }>;
  pipelineError: string | null;
}

const CHANNEL_LABELS: Record<string, string> = { WA: 'WhatsApp', IG: 'Instagram DMs' };
const CHANNEL_TONE: Record<string, string> = {
  WA: 'bg-success-soft text-success border-success/20',
  IG: 'bg-warning-soft text-warning border-warning/20',
};

// Single tab covering every channel-credential operation an admin needs:
// list connected, edit account ids, disconnect, and connect a new channel.
// Tokens themselves live in Vercel env vars (WHATSAPP_TOKEN_<BRAND> /
// INSTAGRAM_TOKEN_<BRAND>) — this tab links account ids to brands and
// reports whether the matching env var is set.
export default function ChannelsTab() {
  const [rows, setRows] = useState<BrandChannelRow[]>([]);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rowsRes, stateRes] = await Promise.all([
        fetch('/api/brand-channels'),
        fetch('/api/onboarding/state'),
      ]);
      if (!rowsRes.ok) {
        const data = await rowsRes.json().catch(() => ({}));
        setError(data?.error ?? 'Could not load channels');
        return;
      }
      setRows(await rowsRes.json());
      if (stateRes.ok) setState(await stateRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function remove(id: string, label: string) {
    if (!confirm(`Disconnect ${label}? Conversations stay but new inbound on this number will be ignored until reconnected.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/brand-channels/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Could not delete'); return; }
      await load();
    } catch {
      setError('Network error.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Channels</h3>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Every brand+channel currently wired into the inbox. Connect a new number, rotate a token if Meta forces a refresh, or disconnect a channel entirely.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => { setError(null); setConnectOpen(true); }}>
          + Connect channel
        </Button>
      </div>

      {/* Persistent how-this-works banner — admins land here looking for a
          token field. Spell out the new flow once so we don't keep
          surprising them. */}
      <div className="bg-canvas border border-border-default rounded-md px-3 py-2.5 text-[12px] text-text-secondary">
        <p className="font-medium text-text-default mb-1">How channel auth works</p>
        <p>
          Connect a brand by adding its Meta <strong>account ID</strong> (WhatsApp phone number ID
          or IG Business Account ID) below. The matching access token lives in your
          Vercel environment as
          <code className="font-mono"> WHATSAPP_TOKEN_&lt;BRAND&gt; </code>or
          <code className="font-mono"> INSTAGRAM_TOKEN_&lt;BRAND&gt;</code>.
          To rotate, change the env var in Vercel and redeploy.
        </p>
      </div>

      {notice && (
        <div className="bg-warning-soft border border-warning/20 text-warning text-xs px-3 py-2 rounded-md">
          {notice}
        </div>
      )}

      {error && <div className="bg-danger-soft border border-danger/20 text-danger text-xs px-3 py-2 rounded-md">{error}</div>}

      <div className="rounded-lg border border-border-default bg-elevated overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-text-muted text-center">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-text-muted text-center">
            No channels connected yet. Use <strong>+ Connect channel</strong> above to wire one up.
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {rows.map((r) => (
              <ChannelRow
                key={r.id}
                row={r}
                brandName={state?.brands.find((b) => b.id === r.brand)?.name ?? r.brand}
                editing={editingId === r.id}
                onEditStart={() => setEditingId(r.id)}
                onEditCancel={() => setEditingId(null)}
                onChanged={async () => { setEditingId(null); await load(); }}
                onDelete={() => remove(r.id, `${r.brand} · ${CHANNEL_LABELS[r.channel] ?? r.channel}`)}
              />
            ))}
          </div>
        )}
      </div>

      {connectOpen && (
        <ConnectChannelModal
          state={state}
          existingRows={rows}
          onClose={() => setConnectOpen(false)}
          onConnected={async (warning) => {
            setConnectOpen(false);
            setNotice(warning ?? null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function ChannelRow({
  row,
  brandName,
  editing,
  onEditStart,
  onEditCancel,
  onChanged,
  onDelete,
}: {
  row: BrandChannelRow;
  brandName: string;
  editing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onChanged: () => void;
  onDelete: () => void;
}) {
  const [accountId, setAccountId] = useState(row.external_account_id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const payload: Record<string, string> = {};
      if (accountId.trim() !== row.external_account_id) payload.external_account_id = accountId.trim();
      if (Object.keys(payload).length === 0) {
        setError('Nothing to update.');
        return;
      }
      const res = await fetch(`/api/brand-channels/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Could not save'); return; }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-primary">{brandName}</span>
            <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-medium border ${CHANNEL_TONE[row.channel] ?? 'bg-muted text-text-secondary border-border-default'}`}>
              {CHANNEL_LABELS[row.channel] ?? row.channel}
            </span>
            {row.display_name && (
              <span className="text-[12px] text-text-secondary truncate">{row.display_name}</span>
            )}
          </div>
          <div className="text-[11px] text-text-muted mt-1 space-y-0.5">
            <div>Account ID: <span className="font-mono">{row.external_account_id}</span></div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span>Token:</span>
              <span className="font-mono">{row.token_env_key}</span>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0 rounded border ${
                row.token_env_set
                  ? 'bg-success-soft text-success border-success/20'
                  : 'bg-danger-soft text-danger border-danger/20'
              }`}>
                {row.token_env_set ? 'env set' : 'env missing'}
              </span>
            </div>
            <div>
              Configured {new Date(row.configured_at).toLocaleDateString()} by {row.configured_by_name ?? 'unknown'}
              {row.updated_at && row.updated_at !== row.configured_at && (
                <> · updated {new Date(row.updated_at).toLocaleDateString()}</>
              )}
            </div>
          </div>
        </div>
        {!editing && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button variant="secondary" size="sm" onClick={onEditStart}>Edit</Button>
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-danger hover:text-danger">Disconnect</Button>
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-4 pt-4 border-t border-border-subtle space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-text-default mb-1">Account ID</label>
            <input
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full px-3 py-2 border border-border-default rounded-md text-sm text-text-default font-mono focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
            />
          </div>
          <div className="rounded-md border border-border-default bg-canvas p-3 text-[11px] text-text-secondary">
            <p className="font-medium text-text-default mb-1">Access token</p>
            <p>
              Tokens live in environment variables, not the database. To rotate this
              brand&apos;s token, update <span className="font-mono">{row.token_env_key}</span> in
              your Vercel project settings and redeploy.
            </p>
          </div>
          {error && <div className="text-[11px] text-danger">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onEditCancel} disabled={busy}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectChannelModal({
  state,
  existingRows,
  onClose,
  onConnected,
}: {
  state: OnboardingState | null;
  existingRows: BrandChannelRow[];
  onClose: () => void;
  onConnected: (warning?: string | null) => void;
}) {
  const [brand, setBrand] = useState('');
  const [channel, setChannel] = useState<'WA' | 'IG'>('WA');
  const [externalId, setExternalId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Live env-var status — null = not checked yet, true/false = result.
  const [envStatus, setEnvStatus] = useState<{ key: string; set: boolean } | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, { onEscape: onClose });

  const brands = state?.brands ?? [];
  const conflict = brand && existingRows.some((r) => r.brand === brand && r.channel === channel);
  const selectedBrandName = brand ? brands.find((b) => b.id === brand)?.name ?? '' : '';

  // Hit /api/brand-channels/env-check with the brand's DISPLAY NAME (not
  // the pipeline id) so the admin sees the human-readable env var key
  // — e.g. WHATSAPP_TOKEN_RSP for "Rahul Saharan Photography", not
  // WHATSAPP_TOKEN_67. Computed via brandToEnvKey() server-side.
  useEffect(() => {
    if (!brand || !selectedBrandName) { setEnvStatus(null); return; }
    let cancelled = false;
    setEnvStatus(null);
    fetch(
      `/api/brand-channels/env-check?display_name=${encodeURIComponent(selectedBrandName)}&channel=${channel}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setEnvStatus({ key: data.token_env_key, set: !!data.token_env_set });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [brand, channel, selectedBrandName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!brand) { setError('Pick a brand'); return; }
    if (conflict) { setError(`${brand} · ${channel} is already connected. Edit it instead.`); return; }
    if (!externalId.trim()) {
      setError('Account ID is required');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/onboarding/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand,
          channel,
          external_account_id: externalId.trim(),
          display_name: selectedBrandName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'Could not connect');
        return;
      }
      // Surface backend's warning (e.g. env var still missing) to the parent
      // so it stays visible after the modal closes.
      onConnected(typeof data?.warning === 'string' ? data.warning : null);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-channel-title"
        tabIndex={-1}
        className="bg-elevated rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col border border-border-default focus:outline-none"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <h2 id="connect-channel-title" className="text-base font-semibold text-text-primary">Connect channel</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xl leading-none" aria-label="Close dialog">×</button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">Brand</label>
            {brands.length === 0 ? (
              <p className="text-xs text-warning">
                No CRM pipelines available right now. {state?.pipelineError ?? 'Check the CRM connection in System.'}
              </p>
            ) : (
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
              >
                <option value="">— Select brand —</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
            <p className="text-[11px] text-text-muted mt-1">
              Brands come from CRM pipelines. Pick the one this number / account belongs to.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">Channel</label>
            <div className="flex gap-1.5">
              <ChannelButton active={channel === 'WA'} onClick={() => setChannel('WA')}>WhatsApp</ChannelButton>
              <ChannelButton active={channel === 'IG'} onClick={() => setChannel('IG')}>Instagram DMs</ChannelButton>
            </div>
            {channel === 'IG' && (
              <p className="text-[11px] text-text-muted mt-1.5">
                Make sure Instagram Messaging is enabled on the IG Business Account in Meta Business Manager and the webhook subscription is active for the <code className="font-mono">instagram</code> object.
              </p>
            )}
          </div>

          {conflict && (
            <div className="bg-warning-soft border border-warning/20 text-warning text-xs px-3 py-2 rounded-md">
              This brand already has a {CHANNEL_LABELS[channel]} channel connected. Use Edit on the existing row to rotate the token.
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-text-secondary mb-1">
              {channel === 'WA' ? 'Phone number ID' : 'Instagram account ID'}
            </label>
            <input
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="e.g. 123456789012345"
              className="w-full text-sm border border-border-default rounded-md px-3 py-2 bg-elevated text-text-default font-mono focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
            />
            <p className="text-[11px] text-text-muted mt-1">
              {channel === 'WA'
                ? 'Find this under Meta Business Manager → WhatsApp Manager → API Setup.'
                : 'Find this under Meta Business Manager → Instagram → Account ID.'}
            </p>
          </div>

          {brand && envStatus && (
            <div className={`rounded-md border p-3 text-[11px] ${
              envStatus.set
                ? 'border-success/20 bg-success-soft text-text-secondary'
                : 'border-warning/20 bg-warning-soft text-text-secondary'
            }`}>
              <p className="font-medium text-text-default mb-1 flex items-center gap-2">
                Access token
                <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                  envStatus.set
                    ? 'bg-success-soft text-success border-success/30'
                    : 'bg-danger-soft text-danger border-danger/30'
                }`}>
                  {envStatus.set ? 'env set' : 'env missing'}
                </span>
              </p>
              {envStatus.set ? (
                <p>
                  <span className="font-mono">{envStatus.key}</span> is configured in
                  this environment — saving now will validate the account ID against
                  Meta before storing it.
                </p>
              ) : (
                <p>
                  To send and receive messages on this channel, add
                  <span className="font-mono"> {envStatus.key} </span>
                  to your Vercel environment variables and redeploy. You can still
                  save the account ID now; the inbox will start working once the env
                  var is in place.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="bg-danger-soft border border-danger/20 text-danger text-xs px-3 py-2 rounded-md">
              {error}
            </div>
          )}
        </form>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-default">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={busy || conflict || !brand || !externalId.trim()}>
            {busy ? 'Saving…' : 'Connect & save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChannelButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-2 rounded-md text-xs font-medium border transition-colors ${
        active
          ? 'bg-brand text-text-inverse border-brand'
          : 'bg-elevated text-text-secondary border-border-default hover:border-border-strong'
      }`}
    >
      {children}
    </button>
  );
}
