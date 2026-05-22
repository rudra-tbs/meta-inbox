'use client';

import type { Conversation } from '@/types';

interface LeadInfoBarProps {
  conversation: Conversation;
}

// Compact summary bar above the chat. Read-only; editing happens in
// DetailRail's Lead section. Empty fields render as light placeholders
// so the operator can tell at a glance what's still missing without
// opening the rail.

function InfoPill({
  icon,
  label,
  value,
  empty,
}: {
  icon: string;
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
      <span className={`text-xs ${empty ? 'opacity-50' : ''}`}>{icon}</span>
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
  const fields = [
    { icon: '📍', label: 'City',    value: conversation.city },
    { icon: '📅', label: 'Event',   value: conversation.wedding_date },
    { icon: '👥', label: 'Guests',  value: conversation.guest_count },
    { icon: '💰', label: 'Budget',  value: conversation.budget_range },
    { icon: '✨', label: 'Service', value: conversation.service_type },
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
