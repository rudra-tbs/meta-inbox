'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation } from '@/types';

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (ctx: { selectedConversation: Conversation | null }) => any;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
  selectedConversation: Conversation | null;
  actions: PaletteAction[];
}

function fuzzyScore(haystack: string, needle: string): number {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (h.includes(n)) return 100 - (h.indexOf(n));
  let score = 0;
  let hi = 0;
  for (const ch of n) {
    const idx = h.indexOf(ch, hi);
    if (idx < 0) return -1;
    score += Math.max(0, 10 - (idx - hi));
    hi = idx + 1;
  }
  return score;
}

export default function CommandPalette({
  open,
  onClose,
  conversations,
  onSelectConversation,
  selectedConversation,
  actions,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      // Defer focus to next tick so the input is mounted
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo(() => {
    const convoItems = conversations
      .map((c) => {
        const label = c.contact_name || `+${c.phone_number}`;
        const sub = `${c.channel} · ${c.mode}${c.crm_stage_name ? ' · ' + c.crm_stage_name : ''}`;
        const score = query
          ? Math.max(
              fuzzyScore(label, query),
              fuzzyScore(c.phone_number, query),
              c.last_message ? fuzzyScore(c.last_message, query) : -1
            )
          : 50;
        return { kind: 'conversation' as const, id: c.id, label, sub, score, conv: c };
      })
      .filter((i) => i.score >= 0);

    const actionItems = actions.map((a) => ({
      kind: 'action' as const,
      id: a.id,
      label: a.label,
      sub: a.hint ?? '',
      score: query ? fuzzyScore(a.label, query) : 80,
      action: a,
    })).filter((i) => i.score >= 0);

    const combined = [...actionItems, ...convoItems].sort((a, b) => b.score - a.score);
    return combined.slice(0, 30);
  }, [conversations, actions, query]);

  useEffect(() => {
    if (cursor >= items.length) setCursor(Math.max(0, items.length - 1));
  }, [items, cursor]);

  function run(idx: number) {
    const item = items[idx];
    if (!item) return;
    if (item.kind === 'conversation') {
      onSelectConversation(item.id);
    } else {
      item.action.run({ selectedConversation });
    }
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(items.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(cursor);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-24"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-elevated rounded-xl shadow-2xl overflow-hidden border border-border-default"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search conversations or run an action…"
          className="w-full px-4 py-3 text-sm text-text-default placeholder:text-text-muted border-b border-border-default focus:outline-none bg-elevated"
        />
        <ul className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <li className="px-4 py-8 text-center text-xs text-text-muted">No results</li>
          ) : (
            items.map((item, i) => (
              <li
                key={`${item.kind}-${item.id}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => run(i)}
                className={`px-4 py-2 cursor-pointer flex items-center justify-between gap-3 ${
                  i === cursor ? 'bg-brand-soft' : 'hover:bg-canvas'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">
                    <span className="text-[10px] font-bold text-text-muted uppercase mr-2">
                      {item.kind === 'action' ? '⚡' : '💬'}
                    </span>
                    {item.label}
                  </p>
                  {item.sub && <p className="text-[11px] text-text-secondary truncate">{item.sub}</p>}
                </div>
                {i === cursor && <span className="text-[10px] text-text-secondary">↵</span>}
              </li>
            ))
          )}
        </ul>
        <div className="hidden md:flex px-3 py-1.5 border-t border-border-subtle text-[10px] text-text-muted items-center justify-between bg-canvas">
          <span>
            <kbd>↑↓</kbd> nav · <kbd>↵</kbd> select · <kbd>esc</kbd> close
          </span>
          <span><kbd>⌘K</kbd></span>
        </div>
      </div>
    </div>
  );
}
