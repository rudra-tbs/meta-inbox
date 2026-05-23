'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase';

// After clicking the reset link in their email, Supabase puts the user into
// a recovery session that allows updateUser({ password }) without re-auth.
// We just need to confirm a session exists, then collect the new password.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowser();

    // Supabase sets a session synchronously when the user lands here from the
    // email link (the SDK consumes the hash on load). We also subscribe to
    // PASSWORD_RECOVERY in case the SDK is still parsing the URL.
    let cancelled = false;

    async function check() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasRecoverySession(!!data.session);
      setChecking(false);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event: string, session: unknown) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setHasRecoverySession(true);
        setChecking(false);
      }
    });

    check();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setDone(true);
      // Sign out the recovery session so the user has to log in fresh with
      // the new password.
      await supabase.auth.signOut();
      setTimeout(() => router.push('/login'), 1500);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="w-96 bg-elevated rounded-2xl shadow-lg border border-border-default p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-brand rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-text-inverse font-bold text-xl">A</span>
          </div>
          <h1 className="text-xl font-semibold text-text-primary">Set a new password</h1>
        </div>

        {checking ? (
          <p className="text-sm text-text-muted text-center py-6">Checking your reset link…</p>
        ) : !hasRecoverySession ? (
          <div className="space-y-4">
            <p className="text-sm text-text-default leading-relaxed">
              This reset link is invalid or has expired. Request a new one from the sign-in page.
            </p>
            <a
              href="/login"
              className="block text-center bg-brand text-text-inverse py-2 rounded-md text-sm font-medium hover:bg-brand-hover transition-colors"
            >
              Back to sign in
            </a>
          </div>
        ) : done ? (
          <div className="text-center space-y-2">
            <div className="w-10 h-10 mx-auto rounded-full bg-success-soft text-success flex items-center justify-center">
              <Check className="w-5 h-5" aria-hidden />
            </div>
            <p className="text-sm text-text-default">Password updated. Redirecting…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-default mb-1">
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                autoComplete="new-password"
                className="w-full px-3 py-2 border border-border-default rounded-md text-sm text-text-default placeholder:text-text-muted focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-default mb-1">
                Confirm password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full px-3 py-2 border border-border-default rounded-md text-sm text-text-default placeholder:text-text-muted focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
                placeholder="Re-enter password"
              />
            </div>

            {error && (
              <div className="bg-danger-soft border border-danger/20 text-danger text-sm px-3 py-2 rounded-md">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-brand text-text-inverse py-2.5 rounded-md text-sm font-medium hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {submitting ? 'Updating…' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
