'use client';

import { useState } from 'react';
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
    return <span className="text-danger" title={message.send_error ?? 'Send failed'}>⚠</span>;
  }
  if (message.read_at) {
    return <span className="text-brand" title={`Read at ${formatTime(message.read_at)}`}>✓✓</span>;
  }
  if (message.delivered_at) {
    return <span className="text-text-muted" title={`Delivered at ${formatTime(message.delivered_at)}`}>✓✓</span>;
  }
  if (message.delivered_status === 'PENDING') {
    return <span className="text-text-disabled" title="Sending">⋯</span>;
  }
  if (message.whatsapp_message_id) {
    return <span className="text-text-muted" title="Sent">✓</span>;
  }
  return <span className="text-text-disabled" title="Sending">⋯</span>;
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
          <div className="bg-elevated shadow-sm rounded-lg rounded-tl-sm px-3 py-2">
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
      <div className={`bg-muted rounded-lg rounded-tr-sm px-3 py-2 ${isFailed ? 'ring-1 ring-danger/40' : ''}`}>
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
            <span className="text-text-secondary">✨</span>
            <span>AI · {formatTime(message.created_at)}</span>
            <ReadStatus message={message} />
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
