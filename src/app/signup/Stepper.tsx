'use client';

import { Check } from 'lucide-react';

interface StepperProps {
  steps: string[];
  current: number; // 0-indexed
}

export default function Stepper({ steps, current }: StepperProps) {
  return (
    <div className="flex items-center gap-2" aria-label="Signup progress">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold transition-colors flex-shrink-0
                  ${done ? 'bg-success text-text-inverse' : ''}
                  ${active ? 'bg-brand text-text-inverse ring-4 ring-brand/15' : ''}
                  ${!done && !active ? 'bg-muted text-text-muted' : ''}`}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <Check className="w-3 h-3" aria-hidden /> : i + 1}
              </span>
              <span
                className={`text-[12px] truncate transition-colors
                  ${active ? 'text-text-primary font-medium' : 'text-text-muted'}`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 h-px bg-border-default" />
            )}
          </div>
        );
      })}
    </div>
  );
}
