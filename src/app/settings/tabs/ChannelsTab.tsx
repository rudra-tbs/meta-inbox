'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';

interface Me {
  id: string;
  access: Array<{ brand: string; channel: string }>;
}

interface OnboardingState {
  brands: Array<{ id: string; name: string; subtitle: string }>;
  configured: Array<{ brand: string; channel: string; display_name: string | null }>;
  pipelineError: string | null;
}

interface ChannelsTabProps {
  me: Me;
  onChanged: () => void;
}

const CHANNEL_LABELS: Record<string, string> = { WA: 'WhatsApp', IG: 'Instagram DMs' };

export default function ChannelsTab({ me, onChanged }: ChannelsTabProps) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Array<{ brand: string; channel: string }>>(me.access);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setPicked(me.access); }, [me.access]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/onboarding/state');
        if (!res.ok || cancelled) return;
        setState(await res.json());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function toggle(brand: string, channel: string) {
    setSaved(false);
    setPicked((prev) => {
      const exists = prev.some((p) => p.brand === brand && p.channel === channel);
      return exists
        ? prev.filter((p) => !(p.brand === brand && p.channel === channel))
        : [...prev, { brand, channel }];
    });
  }

  const dirty =
    picked.length !== me.access.length ||
    picked.some((p) => !me.access.some((a) => a.brand === p.brand && a.channel === p.channel));

  async function save() {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch('/api/onboarding/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access: picked }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Could not save'); return; }
      setSaved(true);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm text-text-muted py-6 text-center">Loading…</div>;
  if (!state) return <div className="text-sm text-danger py-6 text-center">Could not load brands.</div>;

  const configuredBrandIds = new Set(state.configured.map((c) => c.brand));
  const visibleBrands = state.brands.filter((b) => configuredBrandIds.has(b.id));
  const legacyBrands = Array.from(configuredBrandIds).filter((id) => !state.brands.some((b) => b.id === id));

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border-default bg-elevated">
        <div className="px-4 py-3 border-b border-border-subtle">
          <div className="text-sm font-semibold text-text-primary">Brand &amp; channel access</div>
          <div className="text-[11px] text-text-secondary mt-0.5">
            Toggle the brands and channels you should see in your inbox. You can only opt in to channels that are already connected for that brand.
          </div>
        </div>

        <div className="divide-y divide-border-subtle">
          {visibleBrands.length === 0 && legacyBrands.length === 0 && (
            <div className="p-6 text-sm text-text-muted text-center">
              No brands have channels configured yet. Ask an admin to connect one.
            </div>
          )}

          {visibleBrands.map((brand) => (
            <BrandRow
              key={brand.id}
              brandId={brand.id}
              brandName={brand.name}
              brandSubtitle={brand.subtitle}
              configured={state.configured.filter((c) => c.brand === brand.id)}
              picked={picked}
              onToggle={toggle}
            />
          ))}

          {legacyBrands.map((brandId) => (
            <BrandRow
              key={`legacy-${brandId}`}
              brandId={brandId}
              brandName={brandId}
              brandSubtitle="Legacy brand (not in current CRM)"
              configured={state.configured.filter((c) => c.brand === brandId)}
              picked={picked}
              onToggle={toggle}
            />
          ))}
        </div>
      </div>

      {error && <div className="text-xs text-danger">{error}</div>}
      {saved && <div className="text-xs text-success">Access updated.</div>}

      <div className="flex justify-end">
        <Button variant="primary" size="md" onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}

function BrandRow({
  brandId,
  brandName,
  brandSubtitle,
  configured,
  picked,
  onToggle,
}: {
  brandId: string;
  brandName: string;
  brandSubtitle: string;
  configured: Array<{ brand: string; channel: string; display_name: string | null }>;
  picked: Array<{ brand: string; channel: string }>;
  onToggle: (brand: string, channel: string) => void;
}) {
  return (
    <div className="p-4">
      <div className="mb-2">
        <div className="text-sm font-semibold text-text-primary">{brandName}</div>
        <div className="text-[11px] text-text-secondary">{brandSubtitle}</div>
      </div>
      <div className="space-y-1">
        {configured.map((c) => {
          const isOn = picked.some((p) => p.brand === brandId && p.channel === c.channel);
          return (
            <label key={c.channel} className="flex items-center gap-3 py-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => onToggle(brandId, c.channel)}
                className="w-4 h-4 rounded border-border-default text-brand focus:ring-brand/20"
              />
              <span className="text-sm text-text-default flex-1">
                {CHANNEL_LABELS[c.channel] ?? c.channel}
              </span>
              <span className="text-[11px] text-text-muted truncate max-w-[50%]">
                {c.display_name ?? '—'}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
