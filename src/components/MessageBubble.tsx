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

export default function MessageBubble({ message, contactName }: MessageBubbleProps) {
  const isInbound = message.direction === 'INBOUND';

  if (isInbound) {
    return (
      <div className="flex justify-start mb-3">
        <div className="max-w-[70%]">
          <div className="bg-white border border-slate-100 shadow-sm rounded-2xl rounded-tl-none px-4 py-2.5">
            <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">
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
          <div className="bg-rose-500 rounded-2xl rounded-tr-none px-4 py-2.5">
            <p className="text-sm text-white whitespace-pre-wrap break-words">
              {message.content}
            </p>
          </div>
          <p className="text-xs text-rose-300 mt-1 mr-1 text-right">
            AI · {formatTime(message.created_at)}
          </p>
        </div>
      </div>
    );
  }

  // HUMAN sender
  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[70%]">
        <div className="bg-violet-600 rounded-2xl rounded-tr-none px-4 py-2.5">
          <p className="text-sm text-white whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </div>
        <p className="text-xs text-violet-300 mt-1 mr-1 text-right">
          {message.sender_name || 'Agent'} · {formatTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}
