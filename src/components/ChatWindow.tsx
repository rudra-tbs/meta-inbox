'use client';

import { useEffect, useRef, useState } from 'react';
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const displayName = conversation.contact_name || `+${conversation.phone_number}`;
  const daysSinceLast = daysSince(conversation.last_human_message_at);
  const isNewLead = conversation.is_first_contact;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-slate-800 truncate">{displayName}</h2>
          <p className="text-xs text-slate-400 truncate">
            +{conversation.phone_number} ·{' '}
            {isNewLead
              ? 'New lead'
              : daysSinceLast !== null
              ? `Returning · last active ${daysSinceLast}d ago`
              : 'New lead'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* CRM status */}
          {conversation.pushed_to_crm ? (
            <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full whitespace-nowrap">
              ✓ In CRM · Deal #{conversation.crm_deal_id}
            </span>
          ) : (
            <button
              onClick={() => setShowCRMModal(true)}
              className="text-xs font-medium text-slate-600 border border-slate-300 hover:border-green-500 hover:text-green-700 px-2.5 py-1 rounded-full transition-colors whitespace-nowrap"
            >
              Push to CRM
            </button>
          )}
          <AssignDropdown conversation={conversation} onAssign={onAssign} />
          <ModeToggle conversation={conversation} onToggle={onModeChange} />
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
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              contactName={conversation.contact_name}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="bg-white border-t border-slate-200 px-4 py-3">
        {isHumanMode ? (
          <div className="flex gap-2 items-end">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
              rows={2}
              className="flex-1 resize-none text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
            />
            <button
              onClick={handleSend}
              disabled={!reply.trim() || sending}
              className="bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
            >
              {sending ? '...' : 'Send'}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-3">
            <svg
              className="w-4 h-4 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            <span className="text-xs text-slate-400">
              AI is handling this conversation — switch to Human mode to reply manually
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
              className="ml-auto text-xs text-rose-600 hover:text-rose-700 font-medium whitespace-nowrap"
            >
              Switch to Human
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
