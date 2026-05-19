'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Stepper from './Stepper';
import AccountStep from './steps/AccountStep';
import BrandsStep, { type BrandOption } from './steps/BrandsStep';
import SummaryStep, { type ConfiguredChannel } from './steps/SummaryStep';

const STEP_LABELS = ['Account', 'Brands', 'Review'];

interface VerifiedUser {
  id: string;
  name: string;
  email: string;
}

interface SignupClientProps {
  verifiedUser?: VerifiedUser;
}

export default function SignupClient({ verifiedUser }: SignupClientProps) {
  const router = useRouter();

  // Resume the flow at Brands if the user already has a users row (came back
  // mid-flow or was created via admin invite). Fresh visitors start at Account.
  const [step, setStep] = useState(verifiedUser ? 1 : 0);
  const [user, setUser] = useState<{ name: string; email: string } | null>(
    verifiedUser ? { name: verifiedUser.name, email: verifiedUser.email } : null,
  );
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [configured, setConfigured] = useState<ConfiguredChannel[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
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

  // Pull onboarding state once the user is past step 0.
  useEffect(() => {
    if (step >= 1 && brands.length === 0) {
      loadOnboardingState();
    }
  }, [step, brands.length]);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border-default bg-elevated">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-brand rounded-full flex items-center justify-center">
            <span className="text-text-inverse font-bold text-sm">A</span>
          </div>
          <span className="text-sm font-semibold text-text-primary">Inbox</span>
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
              onAccountCreated={(created) => {
                setUser(created);
                setStep(1);
              }}
              onFallbackToLogin={(email, err) => {
                const params = new URLSearchParams();
                if (err) params.set('error', err);
                params.set('email', email);
                router.push(`/login?${params.toString()}`);
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
                onBack={verifiedUser ? () => {} : () => setStep(0)}
                onNext={() => setStep(2)}
              />
            )
          )}

          {step === 2 && user && (
            <SummaryStep
              user={user}
              brands={brands}
              selectedBrands={selectedBrands}
              configured={configured}
              onBack={() => setStep(1)}
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
