'use client';

import type { Conversation } from '@/types';
import Dot from './ui/Dot';

interface ConversationItemProps {
  conversation: Conversation;
  selected: boolean;
  onClick: () => void;
}

const AVATAR_COLORS = [
  'bg-rose-300', 'bg-pink-300', 'bg-purple-300', 'bg-violet-300',
  'bg-indigo-300', 'bg-sky-300', 'bg-teal-300', 'bg-amber-300',
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
  if (diff < 60) return 'now';
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
  const unread = conversation.unread_count ?? 0;
  const hasUnread = unread > 0 && !selected;

  // Single priority indicator — most urgent wins
  const indicator: { tone: 'warning' | 'danger' | 'snooze' | null; label: string } =
    conversation.suggested_reply && conversation.mode === 'HUMAN' ? { tone: 'warning', label: 'Reply ready' }
    : conversation.callback_required ? { tone: 'danger', label: 'Call required' }
    : conversation.needs_human_reply ? { tone: 'warning', label: 'Awaiting reply' }
    : isSnoozed ? { tone: 'snooze', label: 'Snoozed' }
    : { tone: null, label: '' };

  return (
    <button
      onClick={onClick}
      className={`group w-full text-left px-4 py-2.5 flex gap-3 transition-colors
        ${selected
          ? 'bg-brand-soft'
          : hasUnread
            ? 'bg-success-soft/40 hover:bg-success-soft/60'
            : 'hover:bg-canvas'}`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-medium ${colorClass}`}>
          {initials}
        </div>
        {hasUnread ? (
          <span
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success ring-2 ring-elevated"
            title={`${unread} unread`}
          />
        ) : indicator.tone && (
          <span className="absolute -bottom-0.5 -right-0.5 ring-2 ring-elevated rounded-full">
            <Dot tone={indicator.tone} pulse={indicator.tone === 'warning' || indicator.tone === 'danger'} />
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1.5">
          <span className={`text-[13px] truncate text-text-primary ${selected || hasUnread ? 'font-semibold' : 'font-medium'}`}>
            {displayName}
            {score >= 60 && <span className="ml-1 text-[11px]" title={`Lead score ${score}`}>🔥</span>}
          </span>
          <span className="flex items-center gap-1.5 flex-shrink-0">
            {hasUnread && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-semibold leading-none rounded-full bg-success text-white tabular-nums">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
            <span className={`text-[11px] tabular-nums ${hasUnread ? 'text-success font-semibold' : 'text-text-muted'}`}>
              {timeAgo(conversation.last_message_at)}
            </span>
          </span>
        </div>

        <p className={`text-[12px] truncate mt-0.5 leading-tight ${hasUnread ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
          {conversation.last_message || 'No messages yet'}
        </p>

        {/* Subtle metadata row — only when there's something to show */}
        {(conversation.mode === 'HUMAN' ||
          conversation.crm_stage_name ||
          conversation.assigned_user_name ||
          (conversation.tags ?? []).length > 0) && (
          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-text-muted">
            {conversation.mode === 'HUMAN' && (
              <span className="inline-flex items-center gap-1 text-text-secondary">
                <Dot tone="brand" /> Human
              </span>
            )}
            {conversation.crm_stage_name && (
              <span className="truncate">{conversation.crm_stage_name}</span>
            )}
            {(conversation.tags ?? []).slice(0, 2).map((t) => (
              <span key={t} className="truncate">#{t}</span>
            ))}
            {conversation.assigned_user_name && (
              <span className="ml-auto truncate text-text-secondary">{conversation.assigned_user_name}</span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
