'use client';

import { useState } from 'react';
import type { Message } from '@/types';

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

function FailedFooter({ message, onRetry }: { message: Message; onRetry?: () => void }) {
  const [retrying, setRetrying] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleRetry() {
    if (retrying) return;
    setRetrying(true);
    setLocalError(null);
    try {
      const res = await fetch(`/api/messages/${message.id}/retry`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLocalError(data?.details ?? data?.error ?? 'Retry failed');
      }
      onRetry?.();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="mt-1 mr-1 flex items-center justify-end gap-2 text-[11px]">
      <span className="text-danger font-medium" title={message.send_error ?? undefined}>
        {localError ?? 'Failed to send'}
      </span>
      <button
        type="button"
        onClick={handleRetry}
        disabled={retrying}
        className="text-brand hover:text-brand-hover font-medium underline-offset-2 hover:underline disabled:opacity-50"
      >
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
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
    return (
      <div className="flex justify-end mb-2">
        <div className="max-w-[70%]">
          <div className={`bg-muted rounded-lg rounded-tr-sm px-3 py-2 ${isFailed ? 'ring-1 ring-danger/40' : ''}`}>
            <p className="text-[14px] text-text-primary whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </p>
          </div>
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

  return (
    <div className="flex justify-end mb-2">
      <div className="max-w-[70%]">
        <div className={`bg-brand-tint shadow-sm rounded-lg rounded-tr-sm px-3 py-2 ${isFailed ? 'ring-1 ring-danger/40' : ''}`}>
          <p className="text-[14px] text-text-primary whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </p>
        </div>
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
