'use client';

import { Calendar, MapPin, Sparkles, Users, Wallet } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import type { Conversation } from '@/types';

interface LeadInfoBarProps {
  conversation: Conversation;
}

// Compact summary bar above the chat. Read-only; editing happens in
// DetailRail's Lead section. Empty fields render as light placeholders
// so the operator can tell at a glance what's still missing without
// opening the rail.

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

function InfoPill({
  icon: Icon,
  label,
  value,
  empty,
}: {
  icon: IconType;
  label: string;
  value: string;
  empty?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
        empty
          ? 'bg-elevated border-border-subtle text-text-disabled'
          : 'bg-canvas border-border-default'
      }`}
      title={empty ? `${label} not set — click "Lead" in the right panel to add` : undefined}
    >
      <Icon className={`w-3 h-3 ${empty ? 'text-text-disabled' : 'text-text-muted'}`} aria-hidden />
      <span className={`text-[10px] uppercase tracking-wide ${empty ? 'text-text-disabled' : 'text-text-muted'}`}>
        {label}
      </span>
      <span className={`text-xs font-medium ${empty ? 'text-text-disabled' : 'text-text-default'}`}>
        {value}
      </span>
    </div>
  );
}

export default function LeadInfoBar({ conversation }: LeadInfoBarProps) {
  const fields: { icon: IconType; label: string; value: string | null | undefined }[] = [
    { icon: MapPin,   label: 'City',    value: conversation.city },
    { icon: Calendar, label: 'Event',   value: conversation.wedding_date },
    { icon: Users,    label: 'Guests',  value: conversation.guest_count },
    { icon: Wallet,   label: 'Budget',  value: conversation.budget_range },
    { icon: Sparkles, label: 'Service', value: conversation.service_type },
  ];
  const anyFilled = fields.some((f) => !!f.value && f.value.trim().length > 0);
  if (!anyFilled) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-elevated border-b border-border-default overflow-x-auto">
      {fields.map((f) => {
        const empty = !f.value || f.value.trim().length === 0;
        return (
          <InfoPill
            key={f.label}
            icon={f.icon}
            label={f.label}
            value={empty ? '—' : f.value!}
            empty={empty}
          />
        );
      })}
    </div>
  );
}
