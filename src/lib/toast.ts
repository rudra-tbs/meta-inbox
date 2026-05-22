// Tiny event-driven toast store. No external dependency, no context
// provider — components import { toast } from '@/lib/toast' and
// fire-and-forget. The Toaster mounted in layout.tsx subscribes once
// and renders whatever's in the queue.
//
// Three kinds, default durations: success 3.5s, error 5s, info 3.5s.
// Pass durationMs to override. Pass action to render a single button
// inline (used for "Undo", "Retry", etc).

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastEntry {
  id: string;
  kind: ToastKind;
  message: string;
  description?: string;
  durationMs: number;
  action?: ToastAction;
  createdAt: number;
}

type Listener = (toasts: ToastEntry[]) => void;

let toasts: ToastEntry[] = [];
const listeners = new Set<Listener>();

function notify() {
  // Pass a fresh array so React's shallow compare picks it up.
  listeners.forEach((l) => l([...toasts]));
}

function add(input: Omit<ToastEntry, 'id' | 'createdAt'>): string {
  const id = Math.random().toString(36).slice(2, 10);
  const entry: ToastEntry = { ...input, id, createdAt: Date.now() };
  toasts = [...toasts, entry];
  notify();
  if (input.durationMs > 0) {
    setTimeout(() => dismiss(id), input.durationMs);
  }
  return id;
}

export function dismiss(id: string) {
  const before = toasts.length;
  toasts = toasts.filter((t) => t.id !== id);
  if (toasts.length !== before) notify();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener([...toasts]);
  return () => {
    listeners.delete(listener);
  };
}

interface ToastOptions {
  description?: string;
  durationMs?: number;
  action?: ToastAction;
}

export const toast = {
  success(message: string, opts: ToastOptions = {}) {
    return add({ kind: 'success', message, durationMs: opts.durationMs ?? 3500, ...opts });
  },
  error(message: string, opts: ToastOptions = {}) {
    return add({ kind: 'error', message, durationMs: opts.durationMs ?? 5000, ...opts });
  },
  info(message: string, opts: ToastOptions = {}) {
    return add({ kind: 'info', message, durationMs: opts.durationMs ?? 3500, ...opts });
  },
  dismiss,
};
