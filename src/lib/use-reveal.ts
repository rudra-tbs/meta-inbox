'use client';

import { useEffect, useRef, useState } from 'react';

interface UseRevealOptions {
  /** 0..1 — fraction of the element visible before reveal triggers. */
  threshold?: number;
  /** If true (default), the element stays revealed once it enters view. */
  once?: boolean;
  /** Negative bottom rootMargin pulls the trigger up so reveal fires
   *  slightly before the element hits the viewport edge. */
  rootMargin?: string;
}

// Lightweight IntersectionObserver hook. Returns a ref to attach to
// the element you want to watch plus a boolean that flips true the
// first time the element scrolls into view. Respects
// prefers-reduced-motion by reporting `revealed: true` immediately so
// the animation styles get skipped and content shows without motion.

export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options: UseRevealOptions = {},
): { ref: React.RefObject<T>; revealed: boolean } {
  const { threshold = 0.15, once = true, rootMargin = '0px 0px -8% 0px' } = options;
  const ref = useRef<T>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Skip the observer entirely when the user has asked for reduced
    // motion — flip revealed=true so the .reveal CSS class lands in
    // its final state instead of animating in.
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setRevealed(false);
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, once, rootMargin]);

  return { ref, revealed };
}

// Counts an integer up from 0 to `target` using requestAnimationFrame
// with an ease-out cubic curve. Returns 0 until `run` flips true.
// Used by the Stats row to animate "5", "60", "3", "100" once the
// section scrolls in.

export function useCountUp(target: number, run: boolean, durationMs = 900): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) {
      setN(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, target, durationMs]);
  return n;
}
