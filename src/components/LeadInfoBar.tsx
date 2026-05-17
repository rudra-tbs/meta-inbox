'use client';

import type { Conversation } from '@/types';

interface LeadInfoBarProps {
  conversation: Conversation;
}

function InfoPill({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-full">
      <span className="text-xs">{icon}</span>
      <span className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</span>
      <span className="text-xs font-medium text-slate-700">{value}</span>
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
    <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-slate-200 overflow-x-auto">
      {fields.map((f) => (
        <InfoPill key={f.label} icon={f.icon} label={f.label} value={f.value} />
      ))}
    </div>
  );
}
