'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Stepper from './Stepper';
import AccountStep from './steps/AccountStep';
import BrandsStep, { type BrandOption } from './steps/BrandsStep';
import ChannelsStep, { type ConfiguredChannel, type PickedChannel } from './steps/ChannelsStep';
import SummaryStep from './steps/SummaryStep';

const STEP_LABELS = ['Account', 'Brands', 'Channels', 'Review'];

export default function SignupClient() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [configured, setConfigured] = useState<ConfiguredChannel[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [picked, setPicked] = useState<PickedChannel[]>([]);
  const [loadingState, setLoadingState] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  async function loadOnboardingState() {
    setLoadingState(true);
    try {
      const res = await fetch('/api/onboarding/state');
      if (!res.ok) return;
      const data = await res.json();
      setBrands(data.brands ?? []);
      setConfigured(data.configured ?? []);
      setPipelineError(data.pipelineError ?? null);
    } finally {
      setLoadingState(false);
    }
  }

  // Pull onboarding state once the user has signed up (step >= 1).
  useEffect(() => {
    if (step >= 1 && brands.length === 0) {
      loadOnboardingState();
    }
  }, [step, brands.length]);

  // When brand selection changes, auto-include inherited channels in `picked`
  // so the user doesn't have to manually toggle each one — they can opt out
  // on the Channels step if they want.
  useEffect(() => {
    setPicked((prev) => {
      const stillValid = prev.filter((p) => selectedBrands.includes(p.brand));
      const autoAdds: PickedChannel[] = [];
      for (const brand of selectedBrands) {
        for (const c of configured) {
          if (c.brand !== brand) continue;
          const already = stillValid.some((p) => p.brand === brand && p.channel === c.channel);
          if (!already) autoAdds.push({ brand, channel: c.channel });
        }
      }
      return [...stillValid, ...autoAdds];
    });
  }, [selectedBrands, configured]);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border-default bg-elevated">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-brand rounded-full flex items-center justify-center">
            <span className="text-text-inverse font-bold text-sm">A</span>
          </div>
          <span className="text-sm font-semibold text-text-primary">Acceltancy Inbox</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="mb-6">
          <Stepper steps={STEP_LABELS} current={step} />
        </div>

        <div className="bg-elevated rounded-2xl border border-border-default shadow-sm p-6 md:p-8">
          {step === 0 && (
            <AccountStep
              initial={{ name: user?.name ?? '', email: user?.email ?? '' }}
              onSubmitted={(u) => {
                setUser(u);
                setStep(1);
              }}
            />
          )}

          {step === 1 && (
            loadingState && brands.length === 0 ? (
              <LoadingBlock label="Fetching brands from CRM…" />
            ) : (
              <BrandsStep
                brands={brands}
                selected={selectedBrands}
                onChange={setSelectedBrands}
                pipelineError={pipelineError}
                onRetry={loadOnboardingState}
                onBack={() => setStep(0)}
                onNext={() => setStep(2)}
              />
            )
          )}

          {step === 2 && (
            <ChannelsStep
              brands={brands}
              selectedBrands={selectedBrands}
              configured={configured}
              picked={picked}
              onPickedChange={setPicked}
              onConnected={(c) => setConfigured((prev) => [...prev, c])}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}

          {step === 3 && user && (
            <SummaryStep
              user={user}
              brands={brands}
              selectedBrands={selectedBrands}
              configured={configured}
              picked={picked}
              onBack={() => setStep(2)}
              onFinish={() => router.push('/inbox')}
            />
          )}
        </div>

        <p className="text-center text-[11px] text-text-muted mt-6">
          By creating an account you agree to Acceltancy&apos;s internal usage policy.
        </p>
      </main>
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-text-muted">
      {label}
    </div>
  );
}
