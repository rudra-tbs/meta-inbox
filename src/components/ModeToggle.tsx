'use client';

import { useState } from 'react';
import type { Conversation, ConversationMode } from '@/types';

interface ModeToggleProps {
  conversation: Conversation;
  onToggle: (updated: Conversation) => void;
}

export default function ModeToggle({ conversation, onToggle }: ModeToggleProps) {
  const [loading, setLoading] = useState(false);

  async function handleToggle(newMode: ConversationMode) {
    if (newMode === conversation.mode || loading) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/conversations/${conversation.id}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      });

      if (res.ok) {
        const updated = await res.json();
        onToggle(updated);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex rounded-lg bg-slate-100 p-0.5 gap-0.5">
      <button
        onClick={() => handleToggle('AI')}
        disabled={loading}
        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
          conversation.mode === 'AI'
            ? 'bg-rose-500 text-white shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        AI
      </button>
      <button
        onClick={() => handleToggle('HUMAN')}
        disabled={loading}
        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
          conversation.mode === 'HUMAN'
            ? 'bg-amber-400 text-white shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        Human
      </button>
    </div>
  );
}
