'use client';

import type { Tone } from '@/lib/design/tokens';

interface DotProps {
  tone: Tone;
  pulse?: boolean;
  title?: string;
  size?: 'sm' | 'md';
}

const toneClasses: Record<Tone, string> = {
  brand:   'bg-brand',
  success: 'bg-success',
  warning: 'bg-warning',
  danger:  'bg-danger',
  info:    'bg-info',
  snooze:  'bg-snooze',
  ai:      'bg-info',
  neutral: 'bg-text-muted',
};

export default function Dot({ tone, pulse, title, size = 'sm' }: DotProps) {
  const dim = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  return (
    <span className="relative inline-flex items-center" title={title}>
      <span className={`${dim} rounded-full ${toneClasses[tone]}`} />
      {pulse && (
        <span className={`absolute inline-flex h-full w-full rounded-full ${toneClasses[tone]} opacity-60 animate-ping`} />
      )}
    </span>
  );
}
