'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import type { BrandOption } from './BrandsStep';

export interface ConfiguredChannel {
  brand: string;
  channel: string;
  display_name: string | null;
}

interface SummaryStepProps {
  user: { name: string; email: string };
  brands: BrandOption[];
  selectedBrands: string[];
  configured: ConfiguredChannel[];
  onBack: () => void;
  onFinish: () => void;
}

export default function SummaryStep({
  user,
  brands,
  selectedBrands,
  configured,
  onBack,
  onFinish,
}: SummaryStepProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelLabel = (channel: string) => (channel === 'WA' ? 'WhatsApp' : 'Instagram DMs');

  // What channels the agent will inherit — every configured channel on every
  // brand they picked. We show this so they understand what they're being
  // granted access to before clicking Finish.
  const inheritedChannels = configured.filter((c) => selectedBrands.includes(c.brand));

  async function handleFinish() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brands: selectedBrands }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'Could not save access');
        return;
      }
      onFinish();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">You&apos;re all set, {user.name.split(' ')[0]}</h2>
        <p className="text-sm text-text-secondary mt-1">
          Quick check before we drop you into the inbox.
        </p>
      </div>

      <SummaryCard title="Account">
        <Row label="Name" value={user.name} />
        <Row label="Email" value={user.email} />
        <Row label="Role" value="Agent" />
      </SummaryCard>

      <SummaryCard title={`Brands (${selectedBrands.length})`}>
        {brands
          .filter((b) => selectedBrands.includes(b.id))
          .map((b) => (
            <Row key={b.id} label={b.name} value={b.subtitle} />
          ))}
      </SummaryCard>

      <SummaryCard title={`Channels you'll see (${inheritedChannels.length})`}>
        {inheritedChannels.length === 0 ? (
          <p className="text-xs text-text-muted">
            None of your picked brands have channels configured yet. An admin will need to connect one before any conversations land in your inbox.
          </p>
        ) : (
          inheritedChannels.map((c) => {
            const brand = brands.find((b) => b.id === c.brand);
            return (
              <Row
                key={`${c.brand}-${c.channel}`}
                label={`${brand?.name ?? c.brand} · ${channelLabel(c.channel)}`}
                value={c.display_name ?? '—'}
              />
            );
          })
        )}
      </SummaryCard>

      {error && (
        <div className="bg-danger-soft border border-danger/20 text-danger text-sm px-3 py-2 rounded-md">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="md" onClick={onBack} disabled={submitting}>
          ← Back
        </Button>
        <Button variant="primary" size="md" onClick={handleFinish} disabled={submitting}>
          {submitting ? 'Saving…' : 'Enter the inbox →'}
        </Button>
      </div>
    </div>
  );
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border-default bg-elevated">
      <div className="px-4 py-2.5 border-b border-border-subtle">
        <span className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">{title}</span>
      </div>
      <div className="px-4 py-3 space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className="text-text-primary text-right truncate max-w-[60%]">{value}</span>
    </div>
  );
}
