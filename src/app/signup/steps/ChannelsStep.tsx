'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import type { BrandOption } from './BrandsStep';

export interface ConfiguredChannel {
  brand: string;
  channel: string;
  display_name: string | null;
}

export interface PickedChannel {
  brand: string;
  channel: string;
}

interface ChannelsStepProps {
  brands: BrandOption[];
  selectedBrands: string[];
  configured: ConfiguredChannel[];
  picked: PickedChannel[];
  onPickedChange: (next: PickedChannel[]) => void;
  onConnected: (next: ConfiguredChannel) => void;
  onBack: () => void;
  onNext: () => void;
}

type ChannelKind = 'WA' | 'IG';

const CHANNELS: Array<{ id: ChannelKind; name: string; comingSoon?: boolean }> = [
  { id: 'WA', name: 'WhatsApp' },
  { id: 'IG', name: 'Instagram DMs', comingSoon: true },
];

export default function ChannelsStep({
  brands,
  selectedBrands,
  configured,
  picked,
  onPickedChange,
  onConnected,
  onBack,
  onNext,
}: ChannelsStepProps) {
  const [connecting, setConnecting] = useState<{ brand: string; channel: ChannelKind } | null>(null);
  const visibleBrands = brands.filter((b) => selectedBrands.includes(b.id));

  function isPicked(brand: string, channel: string) {
    return picked.some((p) => p.brand === brand && p.channel === channel);
  }
  function togglePick(brand: string, channel: string) {
    if (isPicked(brand, channel)) {
      onPickedChange(picked.filter((p) => !(p.brand === brand && p.channel === channel)));
    } else {
      onPickedChange([...picked, { brand, channel }]);
    }
  }
  function findConfigured(brand: string, channel: string) {
    return configured.find((c) => c.brand === brand && c.channel === channel);
  }

  const hasAnyPick = picked.length > 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Connect your channels</h2>
        <p className="text-sm text-text-secondary mt-1">
          If a brand already has a channel connected, you&apos;ll inherit it. Otherwise connect a new number now or skip and do it later.
        </p>
      </div>

      <div className="space-y-4">
        {visibleBrands.map((brand) => (
          <div key={brand.id} className="rounded-lg border border-border-default bg-elevated">
            <div className="px-4 py-3 border-b border-border-subtle">
              <div className="text-sm font-semibold text-text-primary">{brand.name}</div>
              <div className="text-xs text-text-secondary">{brand.subtitle}</div>
            </div>
            <div className="divide-y divide-border-subtle">
              {CHANNELS.map((ch) => {
                const existing = findConfigured(brand.id, ch.id);
                const inherited = !!existing;
                const isOn = isPicked(brand.id, ch.id);
                const isConnecting =
                  connecting?.brand === brand.id && connecting?.channel === ch.id;

                return (
                  <div key={ch.id}>
                    <div className="px-4 py-3 flex items-center gap-3">
                      <ChannelIcon channel={ch.id} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-text-primary font-medium">{ch.name}</div>
                        <div className="text-xs text-text-secondary truncate">
                          {ch.comingSoon && !existing
                            ? 'Coming soon — Instagram DM integration ships in Phase 2'
                            : inherited
                              ? `Inherited from brand · ${existing.display_name ?? 'connected'}`
                              : 'Not connected yet'}
                        </div>
                      </div>
                      {inherited ? (
                        <Toggle checked={isOn} onClick={() => togglePick(brand.id, ch.id)} label="Use this channel" />
                      ) : ch.comingSoon ? (
                        <span className="text-[11px] text-text-muted">—</span>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setConnecting({ brand: brand.id, channel: ch.id })}
                        >
                          Connect
                        </Button>
                      )}
                    </div>
                    {isConnecting && (
                      <ConnectForm
                        brand={brand.id}
                        channel={ch.id}
                        onCancel={() => setConnecting(null)}
                        onConnected={(c) => {
                          setConnecting(null);
                          onConnected(c);
                          if (!isPicked(brand.id, ch.id)) {
                            onPickedChange([...picked, { brand: brand.id, channel: ch.id }]);
                          }
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="md" onClick={onBack}>
          ← Back
        </Button>
        <Button variant="primary" size="md" onClick={onNext} disabled={!hasAnyPick}>
          Continue
        </Button>
      </div>
    </div>
  );
}

function Toggle({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
        ${checked ? 'bg-brand' : 'bg-muted'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-elevated shadow-sm transition-transform
          ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

function ChannelIcon({ channel }: { channel: ChannelKind }) {
  if (channel === 'WA') {
    return (
      <div className="w-8 h-8 rounded-full bg-channel-wa/10 flex items-center justify-center text-channel-wa text-sm font-bold">
        W
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-channel-ig/10 flex items-center justify-center text-channel-ig text-sm font-bold">
      I
    </div>
  );
}

function ConnectForm({
  brand,
  channel,
  onCancel,
  onConnected,
}: {
  brand: string;
  channel: ChannelKind;
  onCancel: () => void;
  onConnected: (c: ConfiguredChannel) => void;
}) {
  const [externalId, setExternalId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const idLabel = channel === 'WA' ? 'Phone number ID' : 'Instagram account ID';
  const idHelp =
    channel === 'WA'
      ? 'Find this under Meta Business Manager → WhatsApp Manager → API Setup.'
      : 'Find this under Meta Business Manager → Instagram → Account ID.';

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/onboarding/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand,
          channel,
          external_account_id: externalId.trim(),
          access_token: accessToken.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'Could not connect');
        return;
      }
      onConnected({ brand, channel, display_name: data.display_name ?? null });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 pb-4 pt-1 space-y-3 bg-canvas/40">
      <div>
        <label className="block text-xs font-medium text-text-default mb-1">{idLabel}</label>
        <input
          value={externalId}
          onChange={(e) => setExternalId(e.target.value)}
          placeholder="e.g. 123456789012345"
          className="w-full px-3 py-2 border border-border-default rounded-md text-sm text-text-default placeholder:text-text-muted focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
        />
        <p className="mt-1 text-[11px] text-text-muted">{idHelp}</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-text-default mb-1">Access token</label>
        <input
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          placeholder="EAAG…"
          className="w-full px-3 py-2 border border-border-default rounded-md text-sm text-text-default placeholder:text-text-muted focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
        />
        <p className="mt-1 text-[11px] text-text-muted">
          Long-lived system user token. We verify it with Meta before saving.
        </p>
      </div>
      {error && (
        <div className="bg-danger-soft border border-danger/20 text-danger text-xs px-3 py-2 rounded-md">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={submit}
          disabled={busy || !externalId.trim() || !accessToken.trim()}
        >
          {busy ? 'Verifying with Meta…' : 'Connect & save'}
        </Button>
      </div>
    </div>
  );
}
