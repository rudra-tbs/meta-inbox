'use client';

import type { Message } from '@/types';

interface MessageBubbleProps {
  message: Message;
  contactName: string | null;
}

function formatTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function ReadStatus({ message }: { message: Message }) {
  if (message.read_at) {
    return <span className="text-sky-500" title={`Read at ${formatTime(message.read_at)}`}>✓✓</span>;
  }
  if (message.delivered_at) {
    return <span className="text-slate-400" title={`Delivered at ${formatTime(message.delivered_at)}`}>✓✓</span>;
  }
  if (message.whatsapp_message_id) {
    return <span className="text-slate-400" title="Sent">✓</span>;
  }
  return <span className="text-slate-300" title="Sending">⋯</span>;
}

export default function MessageBubble({ message, contactName }: MessageBubbleProps) {
  const isInbound = message.direction === 'INBOUND';

  if (isInbound) {
    return (
      <div className="flex justify-start mb-3">
        <div className="max-w-[70%]">
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl rounded-tl-none px-4 py-2.5">
            <p className="text-sm text-slate-800 whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </p>
          </div>
          <p className="text-xs text-slate-400 mt-1 ml-1">
            {contactName || 'Lead'} · {formatTime(message.created_at)}
          </p>
        </div>
      </div>
    );
  }

  if (message.sender === 'AI') {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[70%]">
          <div className="bg-slate-100 border border-slate-200 rounded-2xl rounded-tr-none px-4 py-2.5">
            <p className="text-sm text-slate-800 whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </p>
          </div>
          <p className="text-xs text-slate-400 mt-1 mr-1 text-right inline-flex items-center gap-1 w-full justify-end">
            <span className="text-sky-500">✨</span>
            <span>AI · {formatTime(message.created_at)}</span>
            <ReadStatus message={message} />
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[70%]">
        <div className="bg-rose-600 shadow-sm rounded-2xl rounded-tr-none px-4 py-2.5">
          <p className="text-sm text-white whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </p>
        </div>
        <p className="text-xs text-slate-400 mt-1 mr-1 text-right inline-flex items-center gap-1 w-full justify-end">
          <span>{message.sender_name || 'Agent'} · {formatTime(message.created_at)}</span>
          <ReadStatus message={message} />
        </p>
      </div>
    </div>
  );
}
