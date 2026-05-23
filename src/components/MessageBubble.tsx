'use client';

import { useState } from 'react';
import { AlertCircle, Check, CheckCheck, Clock, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { Message } from '@/types';
import { toast } from '@/lib/toast';

interface MessageBubbleProps {
  message: Message;
  contactName: string | null;
  showChannel?: boolean;
  onRetry?: () => void;
}

function ChannelTag({ channel }: { channel: 'WA' | 'IG' | null | undefined }) {
  if (!channel) return null;
  const isWA = channel === 'WA';
  return (
    <span
      title={isWA ? 'WhatsApp' : 'Instagram'}
      className={`text-[9px] font-semibold px-1 py-0.5 rounded ${
        isWA ? 'bg-brand-soft text-brand' : 'bg-canvas text-text-secondary'
      }`}
    >
      {channel}
    </span>
  );
}

function formatTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function ReadStatus({ message }: { message: Message }) {
  if (message.delivered_status === 'FAILED') {
    return <AlertCircle className="w-3 h-3 text-danger" aria-label={message.send_error ?? 'Send failed'} />;
  }
  if (message.read_at) {
    return <CheckCheck className="w-3.5 h-3.5 text-brand" aria-label={`Read at ${formatTime(message.read_at)}`} />;
  }
  if (message.delivered_at) {
    return <CheckCheck className="w-3.5 h-3.5 text-text-muted" aria-label={`Delivered at ${formatTime(message.delivered_at)}`} />;
  }
  if (message.delivered_status === 'PENDING') {
    return <Clock className="w-3 h-3 text-text-disabled" aria-label="Sending" />;
  }
  if (message.whatsapp_message_id) {
    return <Check className="w-3.5 h-3.5 text-text-muted" aria-label="Sent" />;
  }
  return <Clock className="w-3 h-3 text-text-disabled" aria-label="Sending" />;
}

// Shared retry handler used by both the inline Retry button and the
// click-the-bubble-to-retry affordance.
function useRetry(message: Message, onRetry?: () => void) {
  const [retrying, setRetrying] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function run() {
    if (retrying) return;
    setRetrying(true);
    setLocalError(null);
    try {
      const res = await fetch(`/api/messages/${message.id}/retry`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.details ?? data?.error ?? 'Retry failed';
        setLocalError(msg);
        toast.error('Retry failed', { description: msg });
      } else {
        toast.success('Message resent');
      }
      onRetry?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Retry failed';
      setLocalError(msg);
      toast.error('Retry failed', { description: msg });
    } finally {
      setRetrying(false);
    }
  }

  return { retrying, localError, run };
}

function FailedFooter({ message, onRetry }: { message: Message; onRetry?: () => void }) {
  const { retrying, localError, run } = useRetry(message, onRetry);
  return (
    <div className="mt-1 mr-1 flex items-center justify-end gap-2 text-[11px]">
      <span className="text-danger font-medium" title={message.send_error ?? undefined}>
        {localError ?? 'Failed to send'}
      </span>
      <button
        type="button"
        onClick={run}
        disabled={retrying}
        className="text-brand hover:text-brand-hover font-medium underline-offset-2 hover:underline disabled:opacity-50"
      >
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );
}

// Thumbs up/down feedback control rendered under AI bubbles. Stores
// the result in ai_message_feedback so admins can later spot poor
// replies for prompt tuning. Optimistic: the icon state flips
// immediately, rolls back if the API call fails.
function AIFeedbackControl({ message }: { message: Message }) {
  const [rating, setRating] = useState<'up' | 'down' | null>(message.feedback_rating ?? null);
  const [busy, setBusy] = useState(false);

  async function setRatingOptimistic(next: 'up' | 'down' | null) {
    const prev = rating;
    if (next === prev) return; // no-op click
    setBusy(true);
    setRating(next);
    try {
      if (next === null) {
        const res = await fetch(`/api/messages/${message.id}/feedback`, { method: 'DELETE' });
        if (!res.ok) throw new Error('clear failed');
      } else {
        const res = await fetch(`/api/messages/${message.id}/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating: next }),
        });
        if (!res.ok) throw new Error('rate failed');
      }
      // Light confirmation toasts — they're cheap signal that the
      // click registered, and the rating affects nothing visible
      // beyond the button itself.
      if (next === 'up') toast.success('Thanks — marked helpful');
      else if (next === 'down') toast.success('Noted — admins will see this for prompt tuning');
      else toast.success('Rating cleared');
    } catch {
      setRating(prev);
      toast.error('Could not save rating');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 ml-1.5 text-[12px]"
      // The whole control sits in the timestamp row; clicks shouldn't
      // bubble up to anything in the bubble that might be clickable.
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => setRatingOptimistic(rating === 'up' ? null : 'up')}
        aria-label={rating === 'up' ? 'Remove helpful rating' : 'Mark this reply as helpful'}
        aria-pressed={rating === 'up'}
        className={`inline-flex items-center justify-center w-5 h-5 rounded transition-colors disabled:opacity-50 ${
          rating === 'up'
            ? 'text-success'
            : 'text-text-muted hover:text-text-secondary'
        }`}
      >
        <ThumbsUp className="w-3.5 h-3.5" aria-hidden fill={rating === 'up' ? 'currentColor' : 'none'} />
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setRatingOptimistic(rating === 'down' ? null : 'down')}
        aria-label={rating === 'down' ? 'Remove not-helpful rating' : 'Mark this reply as not helpful'}
        aria-pressed={rating === 'down'}
        className={`inline-flex items-center justify-center w-5 h-5 rounded transition-colors disabled:opacity-50 ${
          rating === 'down'
            ? 'text-danger'
            : 'text-text-muted hover:text-text-secondary'
        }`}
      >
        <ThumbsDown className="w-3.5 h-3.5" aria-hidden fill={rating === 'down' ? 'currentColor' : 'none'} />
      </button>
    </span>
  );
}

// Wraps a failed outbound bubble so the whole thing is one tap target.
// Hover shows the underlying Meta error via `title`. Keyboard-accessible.
function FailedBubbleClickable({
  message,
  onRetry,
  children,
}: {
  message: Message;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  const { retrying, run } = useRetry(message, onRetry);
  return (
    <div
      role="button"
      tabIndex={0}
      title={message.send_error ?? 'Tap to retry'}
      onClick={(e) => { e.preventDefault(); run(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          run();
        }
      }}
      aria-busy={retrying}
      aria-label="Failed message — tap to retry"
      className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-danger/40 rounded-lg"
    >
      {children}
    </div>
  );
}

export default function MessageBubble({ message, contactName, showChannel, onRetry }: MessageBubbleProps) {
  const isInbound = message.direction === 'INBOUND';
  const isFailed = !isInbound && message.delivered_status === 'FAILED';

  if (isInbound) {
    return (
      <div className="flex justify-start mb-2">
        <div className="max-w-[70%]">
          <div className="bg-elevated border border-border-default shadow-sm rounded-lg rounded-tl-sm px-3 py-2">
            <p className="text-[14px] text-text-primary whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </p>
          </div>
          <p className="text-[11px] text-text-muted mt-1 ml-1 inline-flex items-center gap-1.5">
            {showChannel && <ChannelTag channel={message.channel} />}
            <span>{contactName || 'Lead'} · {formatTime(message.created_at)}</span>
          </p>
        </div>
      </div>
    );
  }

  if (message.sender === 'AI') {
    const bubble = (
      <div className={`bg-brand-soft rounded-lg rounded-tr-sm px-3 py-2 ${isFailed ? 'ring-1 ring-danger/40' : ''}`}>
        <p className="text-[14px] text-text-primary whitespace-pre-wrap break-words leading-relaxed">
          {message.content}
        </p>
      </div>
    );
    return (
      <div className="flex justify-end mb-2">
        <div className="max-w-[70%]">
          {isFailed
            ? <FailedBubbleClickable message={message} onRetry={onRetry}>{bubble}</FailedBubbleClickable>
            : bubble}
          <p className="text-[11px] text-text-muted mt-1 mr-1 text-right inline-flex items-center gap-1 w-full justify-end">
            {showChannel && <ChannelTag channel={message.channel} />}
            <Sparkles className="w-3 h-3 text-brand" aria-hidden />
            <span>AI · {formatTime(message.created_at)}</span>
            <ReadStatus message={message} />
            {!isFailed && <AIFeedbackControl message={message} />}
          </p>
          {isFailed && <FailedFooter message={message} onRetry={onRetry} />}
        </div>
      </div>
    );
  }

  const humanBubble = (
    <div className={`bg-brand-tint shadow-sm rounded-lg rounded-tr-sm px-3 py-2 ${isFailed ? 'ring-1 ring-danger/40' : ''}`}>
      <p className="text-[14px] text-text-primary whitespace-pre-wrap break-words leading-relaxed">
        {message.content}
      </p>
    </div>
  );
  return (
    <div className="flex justify-end mb-2">
      <div className="max-w-[70%]">
        {isFailed
          ? <FailedBubbleClickable message={message} onRetry={onRetry}>{humanBubble}</FailedBubbleClickable>
          : humanBubble}
        <p className="text-[11px] text-text-muted mt-1 mr-1 text-right inline-flex items-center gap-1 w-full justify-end">
          {showChannel && <ChannelTag channel={message.channel} />}
          <span>{message.sender_name || 'Agent'} · {formatTime(message.created_at)}</span>
          <ReadStatus message={message} />
        </p>
        {isFailed && <FailedFooter message={message} onRetry={onRetry} />}
      </div>
    </div>
  );
}
