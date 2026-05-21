// Sentry SDK initialised on the browser. Loads only when SENTRY_DSN is set
// via NEXT_PUBLIC_SENTRY_DSN — leave it unset locally and the SDK no-ops.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Trace ~10% of pageloads in prod, everything in dev. Tune later if cost
    // becomes a concern.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Session Replay is opt-in — leave it off until we evaluate cost/PII.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  });
}
