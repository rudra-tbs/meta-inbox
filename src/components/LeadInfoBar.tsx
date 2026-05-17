'use client';

import type { Conversation } from '@/types';

interface LeadInfoBarProps {
  conversation: Conversation;
}

function InfoPill({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-canvas border border-border-default rounded-full">
      <span className="text-xs">{icon}</span>
      <span className="text-[10px] text-text-muted uppercase tracking-wide">{label}</span>
      <span className="text-xs font-medium text-text-default">{value}</span>
    </div>
  );
}

export default function LeadInfoBar({ conversation }: LeadInfoBarProps) {
  const all: { icon: string; label: string; value: string | null }[] = [
    { icon: '📍', label: 'City',    value: conversation.city },
    { icon: '💍', label: 'Wedding', value: conversation.wedding_date },
    { icon: '👥', label: 'Guests',  value: conversation.guest_count },
    { icon: '💰', label: 'Budget',  value: conversation.budget_range },
    { icon: '✨', label: 'Service', value: conversation.service_type },
  ];
  const fields = all.filter((f): f is { icon: string; label: string; value: string } =>
    !!f.value && f.value.trim().length > 0
  );

  if (fields.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-elevated border-b border-border-default overflow-x-auto">
      {fields.map((f) => (
        <InfoPill key={f.label} icon={f.icon} label={f.label} value={f.value} />
      ))}
    </div>
  );
}
