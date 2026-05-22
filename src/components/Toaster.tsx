'use client';

import { useEffect, useState } from 'react';
import { dismiss, subscribe, type ToastEntry } from '@/lib/toast';

// Mounts once in the root layout. Subscribes to the module-level toast
// store; whenever toast.success / toast.error / toast.info fires, the
// component re-renders with the new queue.
//
// Positioning is bottom-right on desktop; on mobile it crosses the
// width minus padding so the message stays readable.

export default function Toaster() {
  const [items, setItems] = useState<ToastEntry[]>([]);
  useEffect(() => subscribe(setItems), []);

  if (items.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 left-4 md:left-auto md:max-w-sm z-[100] flex flex-col gap-2 pointer-events-none"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto bg-elevated border rounded-lg shadow-lg overflow-hidden ${
            t.kind === 'success'
              ? 'border-success/30'
              : t.kind === 'error'
                ? 'border-danger/30'
                : 'border-border-default'
          }`}
        >
          <div className="flex items-start gap-3 px-4 py-3">
            <span
              className={`mt-0.5 inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                t.kind === 'success'
                  ? 'bg-success'
                  : t.kind === 'error'
                    ? 'bg-danger'
                    : 'bg-text-secondary'
              }`}
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary leading-snug break-words">{t.message}</p>
              {t.description && (
                <p className="text-[12px] text-text-secondary mt-0.5 break-words">{t.description}</p>
              )}
            </div>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
                className="text-xs font-medium text-brand hover:text-brand-hover whitespace-nowrap"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="text-text-muted hover:text-text-default text-base leading-none flex-shrink-0"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
