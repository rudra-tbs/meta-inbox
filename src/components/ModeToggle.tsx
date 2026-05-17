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
    <div className="flex rounded-md bg-muted p-0.5 gap-0.5">
      <button
        onClick={() => handleToggle('AI')}
        disabled={loading}
        className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
          conversation.mode === 'AI'
            ? 'bg-elevated text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        AI
      </button>
      <button
        onClick={() => handleToggle('HUMAN')}
        disabled={loading}
        className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
          conversation.mode === 'HUMAN'
            ? 'bg-elevated text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        Human
      </button>
    </div>
  );
}
