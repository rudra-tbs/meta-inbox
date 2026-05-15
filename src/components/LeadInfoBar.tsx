'use client';

import type { Conversation } from '@/types';

interface LeadInfoBarProps {
  conversation: Conversation;
}

function InfoPill({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center gap-1 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-full">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-xs font-medium ${value ? 'text-slate-700' : 'text-slate-300'}`}>
        {value || '—'}
      </span>
    </div>
  );
}

export default function LeadInfoBar({ conversation }: LeadInfoBarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-slate-200 overflow-x-auto">
      <InfoPill label="City" value={conversation.city} />
      <InfoPill label="Wedding" value={conversation.wedding_date} />
      <InfoPill label="Guests" value={conversation.guest_count} />
      <InfoPill label="Budget" value={conversation.budget_range} />
      <InfoPill label="Service" value={conversation.service_type} />
    </div>
  );
}
