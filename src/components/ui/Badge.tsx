'use client';

import type { ReactNode } from 'react';
import type { Tone } from '@/lib/design/tokens';

interface BadgeProps {
  tone?: Tone;
  size?: 'xs' | 'sm';
  filled?: boolean;
  children: ReactNode;
  title?: string;
  className?: string;
}

// "Soft" (default): tinted background + colored text + matching border.
// "Filled": solid background + inverse text. Use for the highest-priority badge in a row.
const softClasses: Record<Tone, string> = {
  brand:   'bg-brand-soft text-brand border-brand/20',
  success: 'bg-success-soft text-success border-success/20',
  warning: 'bg-warning-soft text-warning border-warning/30',
  danger:  'bg-danger-soft text-danger border-danger/20',
  info:    'bg-info-soft text-info border-info/20',
  snooze:  'bg-snooze-soft text-snooze border-snooze/20',
  ai:      'bg-info-soft text-info border-info/20',
  neutral: 'bg-muted text-text-secondary border-border-default',
};

const filledClasses: Record<Tone, string> = {
  brand:   'bg-brand text-text-inverse border-transparent',
  success: 'bg-success text-text-inverse border-transparent',
  warning: 'bg-warning text-text-inverse border-transparent',
  danger:  'bg-danger text-text-inverse border-transparent',
  info:    'bg-info text-text-inverse border-transparent',
  snooze:  'bg-snooze text-text-inverse border-transparent',
  ai:      'bg-info text-text-inverse border-transparent',
  neutral: 'bg-text-secondary text-text-inverse border-transparent',
};

const sizeClasses = {
  xs: 'text-[10px] px-1.5 py-0.5',
  sm: 'text-xs px-2 py-0.5',
};

export default function Badge({
  tone = 'neutral',
  size = 'xs',
  filled = false,
  children,
  title,
  className = '',
}: BadgeProps) {
  return (
    <span
      title={title}
      className={`
        inline-flex items-center gap-1 font-semibold rounded-full border whitespace-nowrap
        ${filled ? filledClasses[tone] : softClasses[tone]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
