'use client';

import { useEffect, useRef, useState, Fragment } from 'react';
import type { Conversation, Message, AppUser } from '@/types';
import MessageBubble from './MessageBubble';
import LeadInfoBar from './LeadInfoBar';
import ModeToggle from './ModeToggle';
import AssignDropdown from './AssignDropdown';
import PushToCRMModal from './PushToCRMModal';

interface ChatWindowProps {
  conversation: Conversation;
  currentUser: AppUser;
  messages: Message[];
  onModeChange: (updated: Conversation) => void;
  onAssign: (updated: Conversation) => void;
  onConversationUpdate: (updated: Conversation) => void;
  onMessageSent: () => void;
}

function daysSince(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const diff = Date.now() - new Date(isoDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatDateLabel(isoDate: string): string {
  const d = new Date(isoDate);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center justify-center my-4">
      <span className="text-[10px] font-semibold text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-sm">
        {formatDateLabel(date)}
      </span>
    </div>
  );
}

export default function ChatWindow({
  conversation,
  currentUser,
  messages,
  onModeChange,
  onAssign,
  onConversationUpdate,
  onMessageSent,
}: ChatWindowProps) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [dismissingCallback, setDismissingCallback] = useState(false);
  const [showCRMModal, setShowCRMModal] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isHumanMode = conversation.mode === 'HUMAN';
  const suggestion = conversation.suggested_reply;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setReply('');
  }, [conversation.id]);

  async function handleSend() {
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply.trim() }),
      });
      if (res.ok) {
        setReply('');
        onMessageSent();
      }
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab' && !reply && suggestion) {
      e.preventDefault();
      setReply(suggestion);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const displayName = conversation.contact_name || `+${conversation.phone_number}`;
  const daysSinceLast = daysSince(conversation.last_human_message_at);
  const isNewLead = conversation.is_first_contact;
  const siblings = conversation.sibling_conversations ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-800 truncate">{displayName}</h2>
            {isNewLead ? (
              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                New lead
              </span>
            ) : daysSinceLast !== null ? (
              <span className="text-[10px] text-slate-500">
                · Returning · {daysSinceLast}d ago
              </span>
            ) : null}
          </div>
          <p className="text-xs text-slate-500 truncate">
            {conversation.contact_phone && (
              <span className="mr-3">📱 +{conversation.contact_phone}</span>
            )}
            {!conversation.contact_phone && conversation.phone_number && conversation.channel === 'WA' && (
              <span className="mr-3">📱 +{conversation.phone_number}</span>
            )}
            {conversation.contact_instagram_id && (
              <span className="mr-3">📷 @{conversation.contact_instagram_id}</span>
            )}
          </p>
          {siblings.length > 0 && (
            <div className="flex items-center gap-1">
              {siblings.map((s) => (
                <span
                  key={s.id}
                  className="text-[10px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded"
                >
                  Also on {s.channel === 'WA' ? 'WhatsApp' : 'Instagram'}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action group — increasing weight left → right */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <ModeToggle conversation={conversation} onToggle={onModeChange} />
          <AssignDropdown conversation={conversation} onAssign={onAssign} />
          {conversation.pushed_to_crm ? (
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full whitespace-nowrap">
                ✓ Deal #{conversation.crm_deal_id}
              </span>
              {conversation.crm_stage_name && (
                <span className="text-[10px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                  {conversation.crm_stage_name}
                </span>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowCRMModal(true)}
              className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg shadow-sm transition-colors whitespace-nowrap"
            >
              Push to CRM →
            </button>
          )}
        </div>
      </div>

      {/* Callback required banner */}
      {conversation.callback_required && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-red-700">
            📞 Call required — AI told the lead someone will reach out
          </span>
          <button
            disabled={dismissingCallback}
            onClick={async () => {
              setDismissingCallback(true);
              try {
                const res = await fetch(`/api/conversations/${conversation.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ callback_required: false }),
                });
                if (res.ok) {
                  onConversationUpdate({ ...conversation, callback_required: false });
                }
              } finally {
                setDismissingCallback(false);
              }
            }}
            className="text-xs text-red-600 hover:text-red-800 font-medium whitespace-nowrap disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Lead info bar */}
      <LeadInfoBar conversation={conversation} />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-slate-400">
            No messages yet
          </div>
        ) : (
          messages.map((msg, i) => {
            const prev = messages[i - 1];
            const showDateSeparator =
              !prev || new Date(msg.created_at).toDateString() !== new Date(prev.created_at).toDateString();
            return (
              <Fragment key={msg.id}>
                {showDateSeparator && <DateSeparator date={msg.created_at} />}
                <MessageBubble message={msg} contactName={conversation.contact_name} />
              </Fragment>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="bg-white border-t border-slate-200 px-4 py-3">
        {isHumanMode ? (
          <div className="flex flex-col gap-2">
            {suggestion && !reply && (
              <button
                type="button"
                onClick={() => setReply(suggestion)}
                className="text-left bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 hover:bg-amber-100 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">
                    💡 Suggested reply
                  </span>
                  <span className="text-[10px] text-amber-600 whitespace-nowrap">
                    Tab or tap to use
                  </span>
                </div>
                <p className="text-xs text-slate-700 line-clamp-3 whitespace-pre-wrap">
                  {suggestion}
                </p>
              </button>
            )}
            <div className="flex gap-2 items-end">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  suggestion
                    ? 'Tab to use suggestion, or type your own...'
                    : 'Type a message... (Enter to send, Shift+Enter for new line)'
                }
                rows={2}
                className="flex-1 resize-none text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
              />
              <button
                onClick={handleSend}
                disabled={!reply.trim() || sending}
                className="bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end shadow-sm"
              >
                {sending ? '...' : 'Send'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-lg px-3 py-3">
            <span className="text-sky-500">✨</span>
            <span className="text-xs text-sky-700">
              AI is handling this conversation
            </span>
            <button
              onClick={async () => {
                const res = await fetch(`/api/conversations/${conversation.id}/mode`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ mode: 'HUMAN' }),
                });
                if (res.ok) {
                  const updated = await res.json();
                  onModeChange(updated);
                }
              }}
              className="ml-auto text-xs text-rose-600 hover:text-rose-700 font-semibold whitespace-nowrap"
            >
              Switch to Human →
            </button>
          </div>
        )}
      </div>

      {/* Push to CRM modal */}
      {showCRMModal && (
        <PushToCRMModal
          conversation={conversation}
          messages={messages}
          currentUser={currentUser}
          onClose={() => setShowCRMModal(false)}
          onSuccess={(dealId) => {
            setShowCRMModal(false);
            onConversationUpdate({
              ...conversation,
              pushed_to_crm: true,
              crm_deal_id: dealId,
              pushed_to_crm_at: new Date().toISOString(),
              pushed_by_user_id: currentUser.id,
            });
          }}
        />
      )}
    </div>
  );
}
