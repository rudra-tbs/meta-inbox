'use client';

import { useEffect, type RefObject } from 'react';

// Lightweight focus-trap + restore-on-close hook for dialog-like
// components. Attach the ref to the modal's outer container and:
//
//   - On mount: captures whatever element was focused before the modal
//     opened, then focuses the first focusable element inside the
//     container (or the container itself if none).
//   - On Tab/Shift-Tab at the boundaries: cycles focus to the opposite
//     end so keyboard users stay inside the modal.
//   - On Escape: invokes the `onEscape` callback so the parent can
//     close the modal — keeps Escape behaviour consistent without
//     every modal wiring its own keydown listener.
//   - On unmount: restores focus to the originally-focused element.
//
// Usage:
//
//   const ref = useRef<HTMLDivElement>(null);
//   useFocusTrap(ref, { onEscape: onClose });
//   return <div ref={ref}>…</div>;

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface FocusTrapOptions {
  onEscape?: () => void;
  // Skip the auto-focus on mount when the parent wants to control
  // initial focus itself (e.g. a search input it's already focusing).
  autoFocus?: boolean;
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement>,
  { onEscape, autoFocus = true }: FocusTrapOptions = {},
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    function getFocusable(): HTMLElement[] {
      return Array.from(container!.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
    }

    // Initial focus — first focusable, otherwise the container itself.
    if (autoFocus) {
      const focusables = getFocusable();
      const target = focusables[0] ?? container;
      // Defer one frame so any async-rendered children are mounted.
      requestAnimationFrame(() => target.focus());
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = getFocusable();
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !container!.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      // Restore focus only when the originally-focused element is
      // still in the DOM and focusable.
      if (previouslyFocused && document.body.contains(previouslyFocused)) {
        try { previouslyFocused.focus(); } catch { /* ignore */ }
      }
    };
  }, [containerRef, onEscape, autoFocus]);
}
