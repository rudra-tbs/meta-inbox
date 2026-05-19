'use client';

import { useEffect, useRef, useState, Fragment } from 'react';
import type { Conversation, Message, AppUser, ReplyTemplate } from '@/types';
import { SNOOZE_PRESETS } from '@/types';
import MessageBubble from './MessageBubble';
import ModeToggle from './ModeToggle';
import AssignDropdown from './AssignDropdown';
import PushToCRMModal from './PushToCRMModal';
import DetailRail from './DetailRail';
import LeadInfoBar from './LeadInfoBar';
import Button from './ui/Button';
import Dot from './ui/Dot';

interface ChatWindowProps {
  conversation: Conversation;
  currentUser: AppUser;
  messages: Message[];
  onModeChange: (updated: Conversation) => void;
  onAssign: (updated: Conversation) => void;
  onConversationUpdate: (updated: Conversation) => void;
  onMessageSent: () => void;
  onBack?: () => void;
  showChannelTags?: boolean;
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
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center justify-center my-5">
      <span className="text-[10px] font-medium text-text-muted bg-elevated px-2.5 py-0.5 rounded-full border border-border-subtle">
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
  onBack,
  showChannelTags,
}: ChatWindowProps) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [dismissingCallback, setDismissingCallback] = useState(false);
  const [showCRMModal, setShowCRMModal] = useState(false);
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [templates, setTemplates] = useState<ReplyTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const isHumanMode = conversation.mode === 'HUMAN';
  const suggestion = conversation.suggested_reply;
  const isSnoozed = !!conversation.snoozed_until && new Date(conversation.snoozed_until) > new Date();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setReply('');
    setShowTemplates(false);
  }, [conversation.id]);

  useEffect(() => {
    fetch(`/api/reply-templates?brand=${conversation.brand}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setTemplates)
      .catch(() => {});
  }, [conversation.brand]);

  async function handleSend() {
    if (!reply.trim() || sending) return;
    const wasAIMode = !isHumanMode;
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
        // The reply route flips mode to HUMAN server-side. Patch local state
        // immediately so the UI doesn't keep showing "AI is handling" until
        // realtime catches up.
        if (wasAIMode) {
          onModeChange({
            ...conversation,
            mode: 'HUMAN',
            manually_set_human: true,
            last_human_message_at: new Date().toISOString(),
          });
        }
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
    if (e.key === '/' && !reply) {
      e.preventDefault();
      setShowTemplates(true);
      return;
    }
    if (e.key === 'Escape' && showTemplates) {
      setShowTemplates(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function snooze(hours: number | null) {
    const snoozedUntil = hours ? new Date(Date.now() + hours * 3600 * 1000).toISOString() : null;
    setShowSnoozeMenu(false);
    await fetch(`/api/conversations/${conversation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snoozed_until: snoozedUntil }),
    });
    onConversationUpdate({ ...conversation, snoozed_until: snoozedUntil });
  }

  const displayName = conversation.contact_name || `+${conversation.phone_number}`;
  const daysSinceLast = daysSince(conversation.last_human_message_at);
  const isNewLead = conversation.is_first_contact;
  const score = conversation.lead_score ?? 0;

  const contactLine = [
    conversation.contact_phone
      ? `+${conversation.contact_phone}`
      : conversation.channel === 'WA' && conversation.phone_number
      ? `+${conversation.phone_number}`
      : null,
    conversation.contact_instagram_id ? `@${conversation.contact_instagram_id}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col h-full relative bg-elevated">
      {/* Single-row header */}
      <header className="flex items-center justify-between gap-4 px-5 py-3 border-b border-border-default">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden text-text-secondary hover:text-text-primary text-lg leading-none"
              aria-label="Back"
            >
              ←
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 min-w-0">
              <h2 className="text-[15px] font-semibold text-text-primary truncate">{displayName}</h2>
              {score >= 60 && (
                <span title={`Lead score ${score}`} className="text-[11px] font-medium text-danger flex-shrink-0">
                  🔥 {score}
                </span>
              )}
              {isNewLead && (
                <span className="inline-flex items-center gap-1 text-[11px] text-success flex-shrink-0">
                  <Dot tone="success" /> New lead
                </span>
              )}
              {!isNewLead && daysSinceLast !== null && (
                <span className="text-[11px] text-text-muted flex-shrink-0">Returning · {daysSinceLast}d ago</span>
              )}
              {isSnoozed && (
                <span className="inline-flex items-center gap-1 text-[11px] text-snooze flex-shrink-0">
                  <Dot tone="snooze" /> Snoozed
                </span>
              )}
            </div>
            {contactLine && (
              <p className="text-[12px] text-text-secondary truncate mt-0.5">{contactLine}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <ModeToggle conversation={conversation} onToggle={onModeChange} />
          <AssignDropdown conversation={conversation} onAssign={onAssign} />
          <div className="relative">
            <Button
              variant="icon"
              onClick={() => setShowSnoozeMenu((v) => !v)}
              title={isSnoozed ? `Snoozed until ${new Date(conversation.snoozed_until!).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}` : 'Snooze'}
              className={isSnoozed ? 'bg-snooze-soft text-snooze border-snooze/20' : ''}
            >
              💤
            </Button>
            {showSnoozeMenu && (
              <div className="absolute top-full right-0 mt-1 bg-elevated border border-border-default rounded-lg shadow-lg z-10 py-1 min-w-[160px]">
                {SNOOZE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => snooze(p.hours)}
                    className="block w-full text-left text-xs px-3 py-1.5 hover:bg-canvas text-text-default"
                  >
                    {p.label}
                  </button>
                ))}
                {isSnoozed && (
                  <>
                    <hr className="my-1 border-border-default" />
                    <button onClick={() => snooze(null)} className="block w-full text-left text-xs px-3 py-1.5 hover:bg-canvas text-danger">
                      Unsnooze
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <Button
            variant="icon"
            onClick={() => setShowDetail((v) => !v)}
            title="Details"
            className={showDetail ? 'bg-canvas border-border-strong text-text-primary' : ''}
          >
            ⋯
          </Button>
          {conversation.pushed_to_crm ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-success font-medium ml-1" title={`Deal #${conversation.crm_deal_id}${conversation.crm_stage_name ? ` · ${conversation.crm_stage_name}` : ''}`}>
              <Dot tone="success" /> In CRM
            </span>
          ) : (
            <Button variant="primary" size="sm" onClick={() => setShowCRMModal(true)} className="ml-1">
              Push to CRM
            </Button>
          )}
        </div>
      </header>

      {/* Lead snapshot — at-a-glance qualification context, only renders when
          we have at least one field. RM shouldn't need to open the detail rail
          just to see city / dates / budget. */}
      <LeadInfoBar conversation={conversation} />

      {/* Callback banner — slim, one line, brand-token colors */}
      {conversation.callback_required && (
        <div className="px-5 py-2 bg-danger-soft border-b border-danger/20 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-[12px] text-danger">
            <Dot tone="danger" pulse /> Call required — AI told the lead someone will reach out
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
                if (res.ok) onConversationUpdate({ ...conversation, callback_required: false });
              } finally {
                setDismissingCallback(false);
              }
            }}
            className="text-[11px] text-danger hover:underline font-medium disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-5 bg-warm">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs text-text-muted">No messages yet</div>
          ) : (
            messages.map((msg, i) => {
              const prev = messages[i - 1];
              const showDateSeparator =
                !prev || new Date(msg.created_at).toDateString() !== new Date(prev.created_at).toDateString();
              return (
                <Fragment key={msg.id}>
                  {showDateSeparator && <DateSeparator date={msg.created_at} />}
                  <MessageBubble
                    message={msg}
                    contactName={conversation.contact_name}
                    showChannel={showChannelTags}
                    onRetry={onMessageSent}
                  />
                </Fragment>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Detail rail */}
        <DetailRail
          conversation={conversation}
          open={showDetail}
          onClose={() => setShowDetail(false)}
          onConversationUpdate={onConversationUpdate}
        />
      </div>

      {/* Templates popover */}
      {showTemplates && (
        <div className="absolute bottom-24 left-5 right-5 md:right-auto md:w-96 bg-elevated border border-border-default rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
          <div className="px-3 py-2 border-b border-border-default flex items-center justify-between">
            <span className="text-xs font-semibold text-text-primary">Quick replies</span>
            <button onClick={() => setShowTemplates(false)} className="text-text-muted hover:text-text-primary">×</button>
          </div>
          {templates.length === 0 ? (
            <p className="p-3 text-xs text-text-muted">No templates yet. Create them via the API or admin.</p>
          ) : (
            <ul>
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => { setReply(t.content); setShowTemplates(false); textareaRef.current?.focus(); }}
                    className="w-full text-left px-3 py-2 hover:bg-canvas"
                  >
                    <p className="text-xs font-medium text-text-primary">{t.name}</p>
                    <p className="text-[11px] text-text-secondary truncate mt-0.5">{t.content}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Input bar */}
      <div className="bg-elevated border-t border-border-default px-5 py-3">
        <div className="flex flex-col gap-2">
          {!isHumanMode && (
            <div className="flex items-center gap-2 bg-canvas border border-border-default rounded-md px-3 py-1.5">
              <Dot tone="info" />
              <span className="text-[11px] text-text-secondary">
                AI is handling this — typing a reply will switch the conversation to Human mode.
              </span>
            </div>
          )}
          {isHumanMode && suggestion && !reply && (
            <button
              type="button"
              onClick={() => setReply(suggestion)}
              className="text-left bg-warning-soft border border-warning/20 rounded-md px-3 py-2 hover:border-warning/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-warning">
                  <Dot tone="warning" /> Suggested reply
                </span>
                <span className="text-[10px] text-text-muted whitespace-nowrap hidden md:inline">
                  <kbd>Tab</kbd> to use
                </span>
              </div>
              <p className="text-xs text-text-default line-clamp-3 whitespace-pre-wrap">{suggestion}</p>
            </button>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                !isHumanMode
                  ? isDesktop
                    ? 'Reply directly (switches AI → Human)'
                    : 'Reply — switches to Human'
                  : isDesktop
                  ? suggestion
                    ? 'Tab to use suggestion · / for templates · Enter to send'
                    : 'Type a message · / for templates · Enter to send'
                  : 'Type a message'
              }
              rows={2}
              className="flex-1 resize-none text-sm text-text-default placeholder:text-text-muted border border-border-default rounded-md px-3 py-2 focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15 transition-shadow"
            />
            <Button variant="primary" size="md" onClick={handleSend} disabled={!reply.trim() || sending}>
              {sending ? '…' : 'Send'}
            </Button>
          </div>
        </div>
      </div>

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
