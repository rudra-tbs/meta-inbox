// Sentry SDK initialised on Node.js serverless runtime. Loads only when
// SENTRY_DSN is set — leave it unset locally and the SDK no-ops.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Strip request bodies from breadcrumbs — webhooks contain lead PII we
    // don't want to ship to Sentry.
    sendDefaultPii: false,
  });
}
