'use client';

import { useEffect, useRef, useState } from 'react';
import type { Conversation, AppUser } from '@/types';
import { SNOOZE_PRESETS } from '@/types';
import Button from './ui/Button';

interface BulkActionBarProps {
  selectedConversations: Conversation[];
  onClear: () => void;
  onDone: () => void;
}

type BusyKind = 'mode' | 'snooze' | 'assign' | 'tag' | null;

// Sits in place of StatsBar at the bottom of the conversation list when one or
// more conversations are selected. Every action loops the existing per-row
// endpoint client-side — keeps server surface small. On 5-10 selections this
// is fine; if bulk grows to hundreds we'd add a real /bulk endpoint.
export default function BulkActionBar({ selectedConversations, onClear, onDone }: BulkActionBarProps) {
  const [busy, setBusy] = useState<BusyKind>(null);
  const [openMenu, setOpenMenu] = useState<'snooze' | 'assign' | 'tag' | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<AppUser[]>([]);
  const [tagInput, setTagInput] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const count = selectedConversations.length;

  // Close any open menu on outside click / escape.
  useEffect(() => {
    if (!openMenu) return;
    function onDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(null);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  // Load assignable users when the assign menu opens. Scoped to the union
  // of brand+channel pairs in the selection so we don't list anyone who
  // couldn't actually see the threads they'd be assigned.
  useEffect(() => {
    if (openMenu !== 'assign') return;
    const pairs = Array.from(
      new Set(selectedConversations.map((c) => `${c.brand}::${c.channel}`))
    );
    let cancelled = false;
    (async () => {
      const all = await Promise.all(
        pairs.map(async (pair) => {
          const [brand, channel] = pair.split('::');
          const params = new URLSearchParams({ assignable: 'true', brand, channel });
          const res = await fetch(`/api/users?${params.toString()}`);
          return res.ok ? ((await res.json()) as AppUser[]) : [];
        })
      );
      if (cancelled) return;
      // Only show users who appear assignable for every selected conversation.
      const intersect = all.reduce<AppUser[] | null>((acc, list) => {
        if (acc === null) return list;
        const ids = new Set(list.map((u) => u.id));
        return acc.filter((u) => ids.has(u.id));
      }, null) ?? [];
      setAssignableUsers(intersect);
    })();
    return () => { cancelled = true; };
  }, [openMenu, selectedConversations]);

  async function runForEach(kind: BusyKind, fn: (c: Conversation) => Promise<Response | null>) {
    setBusy(kind);
    try {
      // Run sequentially to avoid hammering. ~50-100ms each → fine for typical batches.
      for (const c of selectedConversations) {
        try {
          await fn(c);
        } catch (err) {
          console.error('[BulkAction] failed for', c.id, err);
        }
      }
      setOpenMenu(null);
      onDone();
    } finally {
      setBusy(null);
    }
  }

  async function setMode(mode: 'AI' | 'HUMAN') {
    await runForEach('mode', (c) =>
      fetch(`/api/conversations/${c.id}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
    );
  }

  async function snooze(hours: number | null) {
    const until = hours ? new Date(Date.now() + hours * 3600 * 1000).toISOString() : null;
    await runForEach('snooze', (c) =>
      fetch(`/api/conversations/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snoozed_until: until }),
      })
    );
  }

  async function assignTo(userId: string | null) {
    await runForEach('assign', (c) =>
      fetch(`/api/conversations/${c.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
    );
  }

  async function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    await runForEach('tag', (c) => {
      const next = Array.from(new Set([...(c.tags ?? []), t]));
      return fetch(`/api/conversations/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: next }),
      });
    });
    setTagInput('');
  }

  return (
    <div
      ref={wrapperRef}
      className="border-t border-border-default bg-elevated px-3 py-2 flex items-center gap-1.5 flex-wrap relative"
    >
      <span className="text-[11px] font-semibold text-text-primary mr-1">
        {count} selected
      </span>

      <div className="flex items-center gap-1 ml-auto">
        <BarButton
          label="AI"
          onClick={() => setMode('AI')}
          busy={busy === 'mode'}
          title="Set all selected to AI mode"
        />
        <BarButton
          label="Human"
          onClick={() => setMode('HUMAN')}
          busy={busy === 'mode'}
          title="Set all selected to Human mode"
        />

        <div className="relative">
          <BarButton
            label="Snooze"
            onClick={() => setOpenMenu(openMenu === 'snooze' ? null : 'snooze')}
            busy={busy === 'snooze'}
            title="Snooze all selected"
          />
          {openMenu === 'snooze' && (
            <div className="absolute bottom-full right-0 mb-1 bg-elevated border border-border-default rounded-lg shadow-lg z-20 py-1 min-w-[160px]">
              {SNOOZE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => snooze(p.hours)}
                  disabled={busy === 'snooze'}
                  className="block w-full text-left text-xs px-3 py-1.5 hover:bg-canvas text-text-default disabled:opacity-50"
                >
                  {p.label}
                </button>
              ))}
              {selectedConversations.some((c) => c.snoozed_until && new Date(c.snoozed_until) > new Date()) && (
                <>
                  <hr className="my-1 border-border-default" />
                  <button
                    onClick={() => snooze(null)}
                    disabled={busy === 'snooze'}
                    className="block w-full text-left text-xs px-3 py-1.5 hover:bg-canvas text-danger disabled:opacity-50"
                  >
                    Unsnooze
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="relative">
          <BarButton
            label="Assign"
            onClick={() => setOpenMenu(openMenu === 'assign' ? null : 'assign')}
            busy={busy === 'assign'}
            title="Assign all selected"
          />
          {openMenu === 'assign' && (
            <div className="absolute bottom-full right-0 mb-1 bg-elevated border border-border-default rounded-lg shadow-lg z-20 py-1 min-w-[180px] max-h-64 overflow-y-auto">
              <button
                onClick={() => assignTo(null)}
                disabled={busy === 'assign'}
                className="block w-full text-left text-xs px-3 py-1.5 hover:bg-canvas text-text-secondary border-b border-border-subtle disabled:opacity-50"
              >
                Unassign
              </button>
              {assignableUsers.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-text-muted">
                  No user can be assigned to every selected thread (overlapping brand+channel access required).
                </div>
              ) : (
                assignableUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => assignTo(u.id)}
                    disabled={busy === 'assign'}
                    className="block w-full text-left text-xs px-3 py-1.5 hover:bg-canvas text-text-default disabled:opacity-50"
                  >
                    {u.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="relative">
          <BarButton
            label="Tag"
            onClick={() => setOpenMenu(openMenu === 'tag' ? null : 'tag')}
            busy={busy === 'tag'}
            title="Add a tag to all selected"
          />
          {openMenu === 'tag' && (
            <div className="absolute bottom-full right-0 mb-1 bg-elevated border border-border-default rounded-lg shadow-lg z-20 p-2 min-w-[200px]">
              <input
                autoFocus
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Tag name"
                className="w-full px-2 py-1 text-xs border border-border-default rounded text-text-default placeholder:text-text-muted focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={addTag}
                disabled={busy === 'tag' || !tagInput.trim()}
                className="mt-2 w-full"
              >
                Add to {count}
              </Button>
            </div>
          )}
        </div>

        <button
          onClick={onClear}
          title="Clear selection"
          className="ml-1 w-6 h-6 inline-flex items-center justify-center text-text-muted hover:text-text-primary rounded hover:bg-canvas"
          aria-label="Clear selection"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function BarButton({
  label,
  onClick,
  busy,
  title,
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={title}
      className="px-2 py-1 text-[11px] font-medium text-text-default border border-border-default rounded hover:bg-canvas disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {busy ? '…' : label}
    </button>
  );
}
