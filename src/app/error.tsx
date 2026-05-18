'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Error boundary]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="text-[64px] font-bold text-text-muted leading-none">!</div>
        <h1 className="text-lg font-semibold text-text-primary mt-3">Something went wrong</h1>
        <p className="text-sm text-text-secondary mt-2">
          The page hit an unexpected error. Try again, or head back to the inbox.
        </p>
        {error?.digest && (
          <p className="text-[11px] text-text-muted mt-2 font-mono">id: {error.digest}</p>
        )}
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-brand text-text-inverse hover:bg-brand-hover shadow-sm transition-colors"
          >
            Try again
          </button>
          <a
            href="/inbox"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-elevated text-text-primary border border-border-default hover:bg-canvas transition-colors"
          >
            Back to inbox
          </a>
        </div>
      </div>
    </div>
  );
}
