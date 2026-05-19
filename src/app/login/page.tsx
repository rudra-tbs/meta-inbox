'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase';

interface FriendlyError {
  title: string;
  body: string;
  tone: 'error' | 'info';
}

// Maps known error codes / messages to UI copy. We err on the side of being
// specific — "Invalid login credentials" is actionable, but "OTP expired" or
// "Email not confirmed" hint at deeper flow problems and deserve their own
// callouts so users (and the team triaging tickets) know exactly what's
// happening.
function explainError(raw: string): FriendlyError {
  const norm = raw.toLowerCase();
  if (norm === 'verification_failed' || /verification.*(failed|expired|invalid)/.test(norm)) {
    return {
      title: 'Verification link expired',
      body: 'That link has already been used or expired. Sign up again to get a fresh one — your previous answers will be remembered.',
      tone: 'error',
    };
  }
  if (/invalid login credentials|invalid_credentials/.test(norm)) {
    return {
      title: 'Email or password is wrong',
      body: "Double-check both. If you've forgotten your password, use the link above to reset it.",
      tone: 'error',
    };
  }
  if (/email not confirmed|email_not_confirmed/.test(norm)) {
    return {
      title: 'Email not confirmed yet',
      body: 'Open the verification email we sent and click the link before signing in.',
      tone: 'info',
    };
  }
  if (/rate limit|too many requests/.test(norm)) {
    return {
      title: 'Too many attempts',
      body: 'Wait a minute and try again. Supabase rate-limits repeated sign-in attempts.',
      tone: 'error',
    };
  }
  if (/network|fetch|failed to fetch/.test(norm)) {
    return {
      title: 'Network issue',
      body: "Couldn't reach the server. Check your connection and try again.",
      tone: 'error',
    };
  }
  // Fall through: surface the raw message so we don't silently swallow new
  // Supabase error shapes the team hasn't seen yet.
  return { title: 'Sign-in failed', body: raw, tone: 'error' };
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<FriendlyError | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  // Read ?error= and ?email= from the URL on mount without using
  // useSearchParams (which forces a Suspense boundary for static rendering).
  // ?email= is set by the signup flow when it falls back to /login so users
  // don't have to retype their address.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const rawError = params.get('error');
    if (rawError) setError(explainError(rawError));
    const presetEmail = params.get('email');
    if (presetEmail) setEmail(presetEmail);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = getSupabaseBrowser();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(explainError(authError.message));
        return;
      }

      router.push('/inbox');
    } catch {
      setError(explainError('An unexpected error occurred. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  function openForgot() {
    setForgotEmail(email);
    setForgotError(null);
    setForgotSent(false);
    setForgotOpen(true);
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setForgotError(null);
    setForgotSending(true);
    try {
      const supabase = getSupabaseBrowser();
      // Always show success even if the email isn't on file, so attackers
      // can't enumerate accounts. Supabase will silently no-op for unknown
      // emails.
      const origin = window.location.origin;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        forgotEmail.trim().toLowerCase(),
        { redirectTo: `${origin}/auth/reset-password` }
      );
      if (resetError) {
        setForgotError(resetError.message);
        return;
      }
      setForgotSent(true);
    } catch {
      setForgotError('Network error. Please try again.');
    } finally {
      setForgotSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="w-96 bg-elevated rounded-2xl shadow-lg border border-border-default p-8">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-text-inverse font-bold text-xl">A</span>
          </div>
          <h1 className="text-2xl font-semibold text-text-primary">Inbox</h1>
          <p className="text-sm text-text-secondary mt-1">Sign in with your team account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-default mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-border-default rounded-md text-sm text-text-default placeholder:text-text-muted focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label className="block text-sm font-medium text-text-default">
                Password
              </label>
              <button
                type="button"
                onClick={openForgot}
                className="text-[11px] text-brand font-medium hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-border-default rounded-md text-sm text-text-default placeholder:text-text-muted focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div
              role="alert"
              className={`px-3 py-2.5 rounded-md border flex items-start gap-2 ${
                error.tone === 'info'
                  ? 'bg-brand-soft border-brand/20 text-text-default'
                  : 'bg-danger-soft border-danger/20 text-danger'
              }`}
            >
              <span aria-hidden className="text-base leading-none mt-0.5">
                {error.tone === 'info' ? 'ℹ️' : '⚠️'}
              </span>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${error.tone === 'info' ? 'text-text-primary' : ''}`}>
                  {error.title}
                </div>
                <div className={`text-[12px] mt-0.5 leading-snug ${error.tone === 'info' ? 'text-text-secondary' : 'text-danger/90'}`}>
                  {error.body}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className={`text-base leading-none ${error.tone === 'info' ? 'text-text-muted hover:text-text-primary' : 'text-danger/70 hover:text-danger'}`}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand text-text-inverse py-2.5 rounded-md text-sm font-medium hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-text-secondary mt-6">
          New to Acceltancy?{' '}
          <a href="/signup" className="text-brand font-medium hover:underline">
            Create an account
          </a>
        </p>
      </div>

      {forgotOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setForgotOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-96 bg-elevated rounded-2xl shadow-lg border border-border-default p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-text-primary">Reset password</h2>
              <button
                onClick={() => setForgotOpen(false)}
                className="text-text-muted hover:text-text-primary text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {forgotSent ? (
              <div>
                <p className="text-sm text-text-default leading-relaxed">
                  If an account exists for <span className="font-medium">{forgotEmail}</span>, a
                  reset link is on its way. Check your inbox (and spam folder).
                </p>
                <button
                  onClick={() => setForgotOpen(false)}
                  className="mt-4 w-full bg-brand text-text-inverse py-2 rounded-md text-sm font-medium hover:bg-brand-hover transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-3">
                <p className="text-xs text-text-secondary leading-relaxed">
                  Enter your work email — we&apos;ll send a link to set a new password.
                </p>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3 py-2 border border-border-default rounded-md text-sm text-text-default placeholder:text-text-muted focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
                  placeholder="you@acceltancy.in"
                />
                {forgotError && (
                  <div className="bg-danger-soft border border-danger/20 text-danger text-xs px-3 py-2 rounded-md">
                    {forgotError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={forgotSending || !forgotEmail.trim()}
                  className="w-full bg-brand text-text-inverse py-2 rounded-md text-sm font-medium hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {forgotSending ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
