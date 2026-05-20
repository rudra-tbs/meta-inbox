'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const TOUR_KEY = 'inbox.tour.completed.v1';

interface Step {
  selector: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  title: string;
  body: string;
}

// Steps reference data-tour attributes added to the real components, so the
// tour follows whatever DOM ends up rendered (no fragile selectors).
const STEPS: Step[] = [
  {
    selector: '[data-tour="brand-rail"]',
    position: 'right',
    title: 'Your brands',
    body: 'Every brand you have access to lives in this rail. Click a chip to switch brands — you only see the conversations for whichever brand is active.',
  },
  {
    selector: '[data-tour="conversation-list"]',
    position: 'right',
    title: 'Conversation list',
    body: 'Inbound WhatsApp messages land here. Filter by AI/Human/Mine, search by name or phone, and the 🔥 marker bubbles up hot leads automatically.',
  },
  {
    selector: '[data-tour="mode-toggle"]',
    position: 'bottom',
    title: 'AI / Human mode',
    body: 'AI handles new conversations by default and qualifies the lead. Flip to Human when you want to take over — the AI keeps drafting suggested replies in the background.',
  },
  {
    selector: '[data-tour="push-crm"]',
    position: 'bottom',
    title: 'Push to CRM',
    body: 'Once a lead is qualified, push the deal straight to the right CRM pipeline with one click. City, date, budget, and notes are pre-filled from the conversation.',
  },
];

interface Rect { top: number; left: number; width: number; height: number }

function getRect(selector: string): Rect | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = (el as HTMLElement).getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export default function WelcomeTour({ userName }: { userName: string }) {
  // null = hidden, 'intro' = welcome card, number = step index
  const [step, setStep] = useState<number | 'intro' | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Trigger once on mount if the user hasn't completed/skipped before.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(TOUR_KEY)) return;
    // Tiny delay so the inbox layout has settled and our query selectors hit.
    const t = setTimeout(() => setStep('intro'), 600);
    return () => clearTimeout(t);
  }, []);

  // Recompute the target rect whenever the step changes or the window resizes.
  useLayoutEffect(() => {
    if (typeof step !== 'number') {
      setRect(null);
      return;
    }
    const current = STEPS[step];
    const updateRect = () => setRect(getRect(current.selector));
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [step]);

  function dismiss() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TOUR_KEY, '1');
    }
    setStep(null);
  }

  function next() {
    if (step === 'intro') { setStep(0); return; }
    if (typeof step === 'number') {
      if (step + 1 >= STEPS.length) dismiss();
      else setStep(step + 1);
    }
  }

  function back() {
    if (typeof step === 'number' && step > 0) setStep(step - 1);
  }

  if (step === null) return null;

  if (step === 'intro') {
    return (
      <div className="fixed inset-0 z-[60] bg-black/30 flex items-end md:items-center justify-center p-4">
        <div className="bg-elevated rounded-2xl border border-border-default shadow-2xl w-full max-w-md p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-brand-soft text-brand flex items-center justify-center text-xl">
              👋
            </div>
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                Welcome to the inbox, {userName.split(' ')[0]}
              </h3>
              <p className="text-[12px] text-text-secondary">Quick 30-second tour?</p>
            </div>
          </div>
          <p className="text-sm text-text-default leading-relaxed mb-5">
            We&apos;ll point out the four things you&apos;ll touch most: the brand rail, the conversation list, the AI/Human toggle, and Push to CRM.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="text-sm text-text-secondary hover:text-text-primary px-3 py-2"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={next}
              className="text-sm font-semibold bg-brand text-text-inverse px-4 py-2 rounded-md hover:bg-brand-hover transition-colors shadow-sm"
            >
              Show me →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step popover. If the target element isn't found (rare — e.g. user
  // navigated away mid-tour), fall back to a centered card explaining the
  // step without the highlight so the tour still reads cleanly.
  const current = STEPS[step];
  const popoverStyle = computePopoverPosition(rect, current.position);
  const ringStyle = rect
    ? {
        top: rect.top - 6,
        left: rect.left - 6,
        width: rect.width + 12,
        height: rect.height + 12,
      }
    : null;

  return (
    <>
      {/* Dim backdrop — clicking it does NOT dismiss the tour (the X / Skip
          button is explicit), but a click on the dimmed area is harmless. */}
      <div className="fixed inset-0 z-[59] bg-black/40 pointer-events-none" />

      {/* Highlight ring around the target. Pointer-events-none so the agent
          can still click the actual element if curiosity strikes. */}
      {ringStyle && (
        <div
          aria-hidden
          className="fixed z-[60] rounded-lg ring-4 ring-brand/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] pointer-events-none transition-all"
          style={ringStyle}
        />
      )}

      <div
        ref={popoverRef}
        role="dialog"
        aria-labelledby="tour-title"
        className="fixed z-[61] w-[320px] max-w-[calc(100vw-32px)] bg-elevated rounded-xl border border-border-default shadow-2xl p-4"
        style={popoverStyle}
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-brand">
            Step {step + 1} of {STEPS.length}
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="text-text-muted hover:text-text-primary text-base leading-none"
            aria-label="Skip tour"
          >
            ×
          </button>
        </div>
        <h3 id="tour-title" className="text-sm font-semibold text-text-primary">{current.title}</h3>
        <p className="mt-1.5 text-[12px] text-text-secondary leading-relaxed">{current.body}</p>
        <div className="flex items-center justify-between mt-4">
          <button
            type="button"
            onClick={back}
            disabled={step === 0}
            className="text-[12px] text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:hover:text-text-secondary"
          >
            ← Back
          </button>
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${i === step ? 'bg-brand' : 'bg-border-default'}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={next}
            className="text-[12px] font-semibold bg-brand text-text-inverse px-3 py-1.5 rounded-md hover:bg-brand-hover"
          >
            {step + 1 === STEPS.length ? 'Done' : 'Next →'}
          </button>
        </div>
      </div>
    </>
  );
}

// Pure positioning: places the popover next to the target rect on the given
// side, clamped to the viewport so it never spills off-screen. Falls back to
// centered when there's no rect (target not found).
function computePopoverPosition(
  rect: Rect | null,
  position: 'top' | 'bottom' | 'left' | 'right',
): React.CSSProperties {
  if (typeof window === 'undefined') return {};
  const POP_WIDTH = 320;
  const POP_HEIGHT = 180; // approximate; clamping handles overflow
  const GAP = 12;
  const PAD = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!rect) {
    return {
      top: Math.max(PAD, (vh - POP_HEIGHT) / 2),
      left: Math.max(PAD, (vw - POP_WIDTH) / 2),
    };
  }

  let top = 0;
  let left = 0;
  switch (position) {
    case 'right':
      top = rect.top + rect.height / 2 - POP_HEIGHT / 2;
      left = rect.left + rect.width + GAP;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - POP_HEIGHT / 2;
      left = rect.left - POP_WIDTH - GAP;
      break;
    case 'bottom':
      top = rect.top + rect.height + GAP;
      left = rect.left + rect.width / 2 - POP_WIDTH / 2;
      break;
    case 'top':
      top = rect.top - POP_HEIGHT - GAP;
      left = rect.left + rect.width / 2 - POP_WIDTH / 2;
      break;
  }

  // Clamp to viewport.
  top = Math.min(Math.max(top, PAD), vh - POP_HEIGHT - PAD);
  left = Math.min(Math.max(left, PAD), vw - POP_WIDTH - PAD);

  return { top, left };
}
