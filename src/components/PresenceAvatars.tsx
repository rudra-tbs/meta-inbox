'use client';

import type { PresenceUser } from '@/lib/use-presence';

// Compact avatar stack rendered in the ChatWindow header when one or
// more other RMs are viewing the same conversation. Helps prevent
// double-replies in a small team. Shows up to 3 avatars + a "+N" pill
// for the overflow.

interface PresenceAvatarsProps {
  others: PresenceUser[];
  max?: number;
}

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

export default function PresenceAvatars({ others, max = 3 }: PresenceAvatarsProps) {
  if (others.length === 0) return null;
  const shown = others.slice(0, max);
  const overflow = others.length - shown.length;
  const tooltip = `Also viewing: ${others.map((o) => o.name).join(', ')}`;

  return (
    <div
      className="inline-flex items-center -space-x-1.5"
      title={tooltip}
      aria-label={tooltip}
    >
      {shown.map((u) => (
        <span
          key={u.user_id}
          style={{ backgroundColor: `hsl(${hashHue(u.name)}, 55%, 45%)` }}
          className="w-6 h-6 rounded-full ring-2 ring-elevated inline-flex items-center justify-center text-[10px] font-semibold text-white"
          aria-hidden
        >
          {initialsOf(u.name)}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="w-6 h-6 rounded-full ring-2 ring-elevated inline-flex items-center justify-center text-[10px] font-semibold text-text-secondary bg-muted"
          aria-hidden
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
