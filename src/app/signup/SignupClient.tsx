'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Stepper from './Stepper';
import AccountStep from './steps/AccountStep';
import BrandsStep, { type BrandOption } from './steps/BrandsStep';
import ChannelsStep, { type ConfiguredChannel, type PickedChannel } from './steps/ChannelsStep';
import SummaryStep from './steps/SummaryStep';

const STEP_LABELS = ['Account', 'Brands', 'Channels', 'Review'];

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

  // If the user has already verified their email and has a users row but
  // no brand access yet, resume the flow at the Brands step.
  const [step, setStep] = useState(verifiedUser ? 1 : 0);
  const user = verifiedUser ? { name: verifiedUser.name, email: verifiedUser.email } : null;
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
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

  // Pull onboarding state once the user is past step 0.
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
          <span className="text-sm font-semibold text-text-primary">Inbox</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {!pendingEmail && (
          <div className="mb-6">
            <Stepper steps={STEP_LABELS} current={step} />
          </div>
        )}

        <div className="bg-elevated rounded-2xl border border-border-default shadow-sm p-6 md:p-8">
          {pendingEmail ? (
            <CheckEmailScreen email={pendingEmail} />
          ) : (
            <>
              {step === 0 && (
                <AccountStep
                  initial={{ name: user?.name ?? '', email: user?.email ?? '' }}
                  onAwaitingVerification={(email) => setPendingEmail(email)}
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
            </>
          )}
        </div>

        {!pendingEmail && (
          <p className="text-center text-[11px] text-text-muted mt-6">
            By creating an account you agree to Acceltancy&apos;s internal usage policy.
          </p>
        )}
      </main>
    </div>
  );
}

function CheckEmailScreen({ email }: { email: string }) {
  return (
    <div className="text-center py-6">
      <div className="w-14 h-14 rounded-2xl bg-brand-soft text-brand flex items-center justify-center mx-auto mb-5" aria-hidden>
        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-text-primary">Check your email</h2>
      <p className="mt-2 text-sm text-text-secondary leading-relaxed max-w-md mx-auto">
        We sent a verification link to <span className="font-medium text-text-primary">{email}</span>.
        Click the link in that email to finish setting up your account.
      </p>
      <p className="mt-4 text-[12px] text-text-muted">
        Didn&apos;t get it? Check your spam folder, or wait a minute and check again. The link expires in
        24 hours.
      </p>
      <div className="mt-6 pt-6 border-t border-border-subtle">
        <a href="/login" className="text-[12px] text-brand font-medium hover:underline">
          Already verified? Sign in →
        </a>
      </div>
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
