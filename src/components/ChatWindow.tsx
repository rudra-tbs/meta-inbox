'use client';

import { useEffect, useRef, useState, Fragment } from 'react';
import type { Conversation, Message, AppUser, ReplyTemplate, ConversationEvent } from '@/types';
import { SNOOZE_PRESETS } from '@/types';
import MessageBubble from './MessageBubble';
import LeadInfoBar from './LeadInfoBar';
import ModeToggle from './ModeToggle';
import AssignDropdown from './AssignDropdown';
import PushToCRMModal from './PushToCRMModal';
import Button from './ui/Button';
import Badge from './ui/Badge';

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
    <div className="flex items-center justify-center my-4">
      <span className="text-[10px] font-semibold text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-sm">
        {formatDateLabel(date)}
      </span>
    </div>
  );
}

function eventLabel(e: ConversationEvent): string {
  const actor = e.actor_name ?? 'system';
  switch (e.event_type) {
    case 'MODE_CHANGED': return `${actor} switched mode to ${e.metadata?.to}`;
    case 'ASSIGNED':
      return e.metadata?.assigned_to ? `${actor} assigned to ${e.metadata?.assigned_name ?? 'agent'}` : `${actor} unassigned`;
    case 'PUSHED_TO_CRM': return `${actor} pushed to CRM (Deal #${e.metadata?.deal_id})`;
    case 'SNOOZED': return `${actor} snoozed until ${e.metadata?.until ? new Date(e.metadata.until).toLocaleString('en-IN') : '—'}`;
    case 'UNSNOOZED': return `${actor} unsnoozed`;
    case 'TAG_ADDED': return `${actor} updated tags: ${(e.metadata?.tags ?? []).join(', ') || '—'}`;
    case 'NOTE_UPDATED': return `${actor} updated notes`;
    case 'ABSTAIN': return `AI abstained — escalated to human`;
    case 'CALLBACK_DETECTED': return `AI flagged a callback`;
    case 'CONTACT_MERGED': return `Contacts merged`;
    default: return `${actor} · ${e.event_type}`;
  }
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
  const [showHistory, setShowHistory] = useState(false);
  const [events, setEvents] = useState<ConversationEvent[]>([]);
  const [notesDraft, setNotesDraft] = useState(conversation.contact_notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [templates, setTemplates] = useState<ReplyTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isHumanMode = conversation.mode === 'HUMAN';
  const suggestion = conversation.suggested_reply;
  const isSnoozed = conversation.snoozed_until && new Date(conversation.snoozed_until) > new Date();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setReply('');
    setNotesDraft(conversation.contact_notes ?? '');
    setShowHistory(false);
    setShowTemplates(false);
  }, [conversation.id, conversation.contact_notes]);

  // Load templates once
  useEffect(() => {
    fetch(`/api/reply-templates?brand=${conversation.brand}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setTemplates)
      .catch(() => {});
  }, [conversation.brand]);

  // Load activity when history panel opens
  useEffect(() => {
    if (!showHistory) return;
    fetch(`/api/conversations/${conversation.id}/events`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setEvents)
      .catch(() => {});
  }, [showHistory, conversation.id]);

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

  function saveNotes(value: string) {
    setNotesDraft(value);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      if (!conversation.contact_id) return;
      setSavingNotes(true);
      try {
        await fetch(`/api/contacts/${conversation.contact_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: value }),
        });
        onConversationUpdate({ ...conversation, contact_notes: value });
      } finally {
        setSavingNotes(false);
      }
    }, 600);
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

  async function setTags(tags: string[]) {
    await fetch(`/api/conversations/${conversation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags }),
    });
    onConversationUpdate({ ...conversation, tags });
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    const current = conversation.tags ?? [];
    if (current.includes(t)) { setTagInput(''); return; }
    setTags([...current, t]);
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags((conversation.tags ?? []).filter((t) => t !== tag));
  }

  const displayName = conversation.contact_name || `+${conversation.phone_number}`;
  const daysSinceLast = daysSince(conversation.last_human_message_at);
  const isNewLead = conversation.is_first_contact;
  const siblings = conversation.sibling_conversations ?? [];
  const score = conversation.lead_score ?? 0;

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden text-slate-500 hover:text-slate-700 text-lg leading-none pt-1"
              aria-label="Back to list"
            >
              ←
            </button>
          )}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-text-primary truncate">{displayName}</h2>
              {score >= 60 && (
                <span title={`Lead score ${score}`} className="text-[10px] font-bold text-danger">🔥 {score}</span>
              )}
              {isNewLead ? (
                <Badge tone="success">New lead</Badge>
              ) : daysSinceLast !== null ? (
                <span className="text-[10px] text-text-secondary">· Returning · {daysSinceLast}d ago</span>
              ) : null}
              {isSnoozed && (
                <Badge tone="snooze">
                  💤 Snoozed until {new Date(conversation.snoozed_until!).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                </Badge>
              )}
            </div>
            <p className="text-xs text-text-secondary truncate">
              {conversation.contact_phone && <span className="mr-3">📱 +{conversation.contact_phone}</span>}
              {!conversation.contact_phone && conversation.phone_number && conversation.channel === 'WA' && (
                <span className="mr-3">📱 +{conversation.phone_number}</span>
              )}
              {conversation.contact_instagram_id && <span className="mr-3">📷 @{conversation.contact_instagram_id}</span>}
            </p>
            {siblings.length > 0 && (
              <div className="flex items-center gap-1">
                {siblings.map((s) => (
                  <Badge key={s.id} tone="neutral">
                    Also on {s.channel === 'WA' ? 'WhatsApp' : 'Instagram'}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <ModeToggle conversation={conversation} onToggle={onModeChange} />
          <AssignDropdown conversation={conversation} onAssign={onAssign} />
          <div className="relative">
            <Button
              variant="icon"
              onClick={() => setShowSnoozeMenu((v) => !v)}
              title={isSnoozed ? 'Snoozed — click to unsnooze' : 'Snooze conversation'}
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
                    className="block w-full text-left text-xs px-3 py-1.5 hover:bg-canvas"
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
            onClick={() => setShowHistory((v) => !v)}
            title="Activity log"
            className={showHistory ? 'bg-canvas border-border-strong' : ''}
          >
            🕐
          </Button>
          {conversation.pushed_to_crm ? (
            <div className="flex flex-col items-end gap-1">
              <Badge tone="success" size="sm">
                ✓ Deal #{conversation.crm_deal_id}
              </Badge>
              {conversation.crm_stage_name && (
                <Badge tone="neutral">{conversation.crm_stage_name}</Badge>
              )}
            </div>
          ) : (
            <Button variant="success" onClick={() => setShowCRMModal(true)}>
              Push to CRM →
            </Button>
          )}
        </div>
      </div>

      {/* Tags row */}
      <div className="flex items-center gap-1.5 px-4 py-1.5 bg-white border-b border-slate-100 flex-wrap">
        {(conversation.tags ?? []).map((t) => (
          <span key={t} className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
            {t}
            <button onClick={() => removeTag(t)} className="text-slate-400 hover:text-red-600 leading-none">×</button>
          </span>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); addTag(); }
          }}
          placeholder="+ tag"
          className="text-[11px] px-2 py-0.5 border-0 outline-none w-16 focus:w-32 transition-all"
        />
      </div>

      {/* Internal notes strip */}
      <div className="bg-yellow-50 border-b border-yellow-100 px-4 py-1.5 flex items-start gap-2">
        <span className="text-[10px] font-bold text-yellow-700 uppercase tracking-wide flex-shrink-0 pt-1">📝 Notes</span>
        <input
          value={notesDraft}
          onChange={(e) => saveNotes(e.target.value)}
          placeholder="Internal note — visible to all RMs, never sent to lead"
          className="flex-1 bg-transparent text-xs text-slate-800 placeholder:text-yellow-600/60 focus:outline-none py-1"
        />
        {savingNotes && <span className="text-[10px] text-slate-400">Saving…</span>}
      </div>

      {conversation.callback_required && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-red-700">📞 Call required — AI told the lead someone will reach out</span>
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
            className="text-xs text-red-600 hover:text-red-800 font-medium whitespace-nowrap disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      )}

      <LeadInfoBar conversation={conversation} />

      <div className="flex flex-1 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs text-slate-400">No messages yet</div>
          ) : (
            messages.map((msg, i) => {
              const prev = messages[i - 1];
              const showDateSeparator =
                !prev || new Date(msg.created_at).toDateString() !== new Date(prev.created_at).toDateString();
              return (
                <Fragment key={msg.id}>
                  {showDateSeparator && <DateSeparator date={msg.created_at} />}
                  <MessageBubble message={msg} contactName={conversation.contact_name} showChannel={showChannelTags} />
                </Fragment>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Activity log panel */}
        {showHistory && (
          <div className="w-72 border-l border-slate-200 bg-white overflow-y-auto">
            <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Activity</span>
              <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
            </div>
            {events.length === 0 ? (
              <p className="p-3 text-xs text-slate-400">No activity yet</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {events.map((e) => (
                  <li key={e.id} className="px-3 py-2 text-xs">
                    <p className="text-slate-700">{eventLabel(e)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(e.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Templates popover */}
      {showTemplates && (
        <div className="absolute bottom-24 left-4 right-4 md:right-auto md:w-96 bg-white border border-slate-200 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
          <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Quick replies</span>
            <button onClick={() => setShowTemplates(false)} className="text-slate-400 hover:text-slate-600">×</button>
          </div>
          {templates.length === 0 ? (
            <p className="p-3 text-xs text-slate-400">No templates yet. Create them via the API or admin.</p>
          ) : (
            <ul>
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => { setReply(t.content); setShowTemplates(false); textareaRef.current?.focus(); }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50"
                  >
                    <p className="text-xs font-medium text-slate-800">{t.name}</p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{t.content}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
                  <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">💡 Suggested reply</span>
                  <span className="text-[10px] text-amber-600 whitespace-nowrap">Tab or tap to use</span>
                </div>
                <p className="text-xs text-slate-700 line-clamp-3 whitespace-pre-wrap">{suggestion}</p>
              </button>
            )}
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  suggestion
                    ? 'Tab to use suggestion · / for templates · Enter to send'
                    : 'Type a message · / for templates · Enter to send'
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
            <span className="text-xs text-sky-700">AI is handling this conversation</span>
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
