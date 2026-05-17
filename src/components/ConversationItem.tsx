'use client';

import type { Conversation } from '@/types';

interface ConversationItemProps {
  conversation: Conversation;
  selected: boolean;
  onClick: () => void;
}

const AVATAR_COLORS = [
  'bg-rose-400',
  'bg-pink-400',
  'bg-purple-400',
  'bg-violet-400',
  'bg-indigo-400',
  'bg-sky-400',
  'bg-teal-400',
  'bg-amber-400',
];

function getAvatarColor(str: string): string {
  let sum = 0;
  for (let i = 0; i < str.length; i++) {
    sum += str.charCodeAt(i);
  }
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
  const displayName =
    conversation.contact_name || `+${conversation.phone_number}`;
  const colorClass = getAvatarColor(conversation.phone_number);
  const initials = getInitials(conversation.contact_name, conversation.phone_number);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 flex gap-3 transition-colors hover:bg-slate-50 ${
        selected
          ? 'bg-rose-50 border-l-2 border-l-rose-500'
          : 'border-l-2 border-l-transparent'
      }`}
    >
      {/* Avatar */}
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${colorClass}`}
      >
        {initials}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-sm font-medium text-slate-800 truncate">
            {displayName}
          </span>
          <span className="text-xs text-slate-400 flex-shrink-0">
            {timeAgo(conversation.last_message_at)}
          </span>
        </div>

        <p className="text-xs text-slate-500 truncate mt-0.5">
          {conversation.last_message || 'No messages yet'}
        </p>

        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {/* Mode badge — subtle when AI, prominent when HUMAN */}
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
              conversation.mode === 'AI'
                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                : 'bg-rose-600 text-white'
            }`}
          >
            {conversation.mode === 'AI' ? '✨ AI' : 'HUMAN'}
          </span>

          {/* Suggested reply ready — highest visual priority */}
          {conversation.suggested_reply && conversation.mode === 'HUMAN' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800 border border-amber-300">
              💡 Reply ready
            </span>
          )}

          {/* Callback required */}
          {conversation.callback_required && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-red-100 text-red-700 border border-red-200">
              📞 Call
            </span>
          )}

          {/* Awaiting reply */}
          {conversation.needs_human_reply && !conversation.suggested_reply && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-yellow-100 text-yellow-800 border border-yellow-200">
              ⚠ Awaiting
            </span>
          )}

          {/* CRM stage */}
          {conversation.crm_stage_name && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              {conversation.crm_stage_name}
            </span>
          )}

          {/* Assigned agent */}
          {conversation.assigned_user_name && (
            <span className="text-[10px] text-slate-500 truncate ml-auto">
              {conversation.assigned_user_name}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
