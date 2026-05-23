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

// Right-side copy that frames each step for the user. Keeps the wizard
// from feeling like a faceless form by explaining what each step does
// and what they can expect next.
const STEP_CONTEXT: Array<{ eyebrow: string; title: string; body: string; points: string[] }> = [
  {
    eyebrow: 'Step 1 of 3',
    title: 'Create your account',
    body: 'We just need a name, your work email, and a password. A verification link goes out instantly — confirm it to unlock the rest of the flow.',
    points: [
      'Work email recommended — it ties your access to the team',
      'A verification email arrives within seconds',
      'Already verified? You can come back any time to finish brand setup',
    ],
  },
  {
    eyebrow: 'Step 2 of 3',
    title: 'Pick the brands you handle',
    body: 'Each brand maps to a CRM pipeline. You only see conversations for the brands you pick here — admins can grant more access later.',
    points: [
      'Pick one or more — most agents only handle one or two',
      'Channels (WhatsApp / Instagram) follow whichever your admin already wired up',
      'New brand showing up in the CRM? Admins enable it in the Pipelines tab',
    ],
  },
  {
    eyebrow: 'Step 3 of 3',
    title: 'Almost done',
    body: "Quick review and you're in. The inbox loads with the channels you can access already filtered — no extra setup on your side.",
    points: [
      'Your selections are saved against your team account',
      'Hit Finish to land directly in the inbox',
      'Need to change brands later? Ask an admin from the team',
    ],
  },
];

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

  const ctx = STEP_CONTEXT[step] ?? STEP_CONTEXT[0];

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border-default bg-elevated">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-2">
          <div className="w-7 h-7 bg-brand rounded-lg flex items-center justify-center">
            <span className="text-text-inverse font-bold text-sm">A</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-text-primary">Inbox</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 lg:py-12 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
        {/* Wizard column */}
        <div className="max-w-2xl mx-auto lg:mx-0 w-full">
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

          <p className="text-center lg:text-left text-[11px] text-text-muted mt-6">
            By creating an account you agree to Acceltancy&apos;s internal usage policy.
          </p>
        </div>

        {/* Contextual help column — lg+ only */}
        <aside className="hidden lg:block lg:sticky lg:top-12 lg:self-start">
          <div className="bg-brand-soft/40 rounded-2xl border border-brand/15 p-6">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-brand mb-2">
              {ctx.eyebrow}
            </div>
            <h2 className="text-lg font-semibold text-text-primary tracking-tight leading-snug">
              {ctx.title}
            </h2>
            <p className="text-sm text-text-secondary mt-3 leading-relaxed">{ctx.body}</p>
            <ul className="mt-5 space-y-2.5">
              {ctx.points.map((p) => (
                <li key={p} className="flex items-start gap-2 text-[13px] text-text-default leading-snug">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-brand flex-shrink-0" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
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
