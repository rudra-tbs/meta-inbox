'use client';

import type { Conversation } from '@/types';
import Badge from './ui/Badge';

interface ConversationItemProps {
  conversation: Conversation;
  selected: boolean;
  onClick: () => void;
}

const AVATAR_COLORS = [
  'bg-rose-400', 'bg-pink-400', 'bg-purple-400', 'bg-violet-400',
  'bg-indigo-400', 'bg-sky-400', 'bg-teal-400', 'bg-amber-400',
];

function getAvatarColor(str: string): string {
  let sum = 0;
  for (let i = 0; i < str.length; i++) sum += str.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function getInitials(name: string | null, phone: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return phone.slice(-2);
}

function timeAgo(isoDate: string): string {
  const now = new Date();
  const then = new Date(isoDate);
  const diff = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function ConversationItem({
  conversation,
  selected,
  onClick,
}: ConversationItemProps) {
  const displayName = conversation.contact_name || `+${conversation.phone_number}`;
  const colorClass = getAvatarColor(conversation.phone_number);
  const initials = getInitials(conversation.contact_name, conversation.phone_number);
  const isSnoozed = conversation.snoozed_until && new Date(conversation.snoozed_until) > new Date();
  const score = conversation.lead_score ?? 0;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 flex gap-3 transition-colors hover:bg-canvas
        ${selected ? 'bg-brand-soft border-l-2 border-l-brand' : 'border-l-2 border-l-transparent'}`}
    >
      {/* Avatar */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${colorClass}`}>
        {initials}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-sm font-medium text-text-primary truncate inline-flex items-center gap-1">
            {score >= 60 && <span title={`Lead score ${score}`} className="text-xs">🔥</span>}
            {displayName}
          </span>
          <span className="text-xs text-text-muted flex-shrink-0">
            {timeAgo(conversation.last_message_at)}
          </span>
        </div>

        <p className="text-xs text-text-secondary truncate mt-0.5">
          {conversation.last_message || 'No messages yet'}
        </p>

        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {/* Mode — HUMAN filled brand, AI soft info */}
          {conversation.mode === 'HUMAN' ? (
            <Badge tone="brand" filled>HUMAN</Badge>
          ) : (
            <Badge tone="ai">✨ AI</Badge>
          )}

          {conversation.suggested_reply && conversation.mode === 'HUMAN' && (
            <Badge tone="warning">💡 Reply ready</Badge>
          )}

          {conversation.callback_required && (
            <Badge tone="danger">📞 Call</Badge>
          )}

          {conversation.needs_human_reply && !conversation.suggested_reply && (
            <Badge tone="warning">⚠ Awaiting</Badge>
          )}

          {isSnoozed && <Badge tone="snooze">💤</Badge>}

          {conversation.crm_stage_name && (
            <Badge tone="success">{conversation.crm_stage_name}</Badge>
          )}

          {(conversation.tags ?? []).slice(0, 2).map((t) => (
            <Badge key={t} tone="neutral">{t}</Badge>
          ))}

          {conversation.assigned_user_name && (
            <span className="text-[10px] text-text-muted truncate ml-auto">
              {conversation.assigned_user_name}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
