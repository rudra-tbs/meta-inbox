// Next.js instrumentation hook — fires once when the server boots and
// loads the runtime-specific Sentry config. Required for @sentry/nextjs
// to actually initialise on Node + Edge in App Router projects.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
