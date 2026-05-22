'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/toast';

export interface SavedFilter {
  id: string;
  name: string;
  status: string | null;
  tag: string | null;
  stage: number | null;
}

interface SavedFiltersBarProps {
  // Current filter state — drives which chip looks "active" and what
  // gets persisted when the user clicks Save current.
  currentStatus: string;
  currentTag: string | null;
  currentStage: number | null;
  // Setters from the parent — invoked when a chip is clicked.
  onApply: (f: SavedFilter) => void;
}

// Sidebar chip row for per-user saved filter presets. Loads once on
// mount via /api/me/saved-filters. Empty state hides the whole row
// except for the "+ Save current" button which only shows when there's
// a non-default filter active (otherwise there's nothing useful to save).
export default function SavedFiltersBar({
  currentStatus,
  currentTag,
  currentStage,
  onApply,
}: SavedFiltersBarProps) {
  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingNew, setSavingNew] = useState(false);

  useEffect(() => {
    fetch('/api/me/saved-filters')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setFilters(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // A chip matches the current filter if every saved field equals the
  // current state. Used to highlight which preset is active.
  function isActive(f: SavedFilter): boolean {
    const statusEq = (f.status ?? 'all') === currentStatus;
    const tagEq = (f.tag ?? null) === (currentTag ?? null);
    const stageEq = (f.stage ?? null) === (currentStage ?? null);
    return statusEq && tagEq && stageEq;
  }

  // Saving makes sense only when the current filter differs from "all".
  // Otherwise the chip would just be "All conversations" which already
  // has a button.
  const canSave =
    currentStatus !== 'all' || currentTag !== null || currentStage !== null;
  const alreadySaved = filters.some(isActive);

  async function saveCurrent() {
    if (!canSave || alreadySaved || savingNew) return;
    const name = window.prompt('Name this filter');
    if (!name?.trim()) return;
    setSavingNew(true);
    try {
      const res = await fetch('/api/me/saved-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          status: currentStatus === 'all' ? null : currentStatus,
          tag: currentTag,
          stage: currentStage,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? 'Could not save filter');
        return;
      }
      setFilters(data);
      toast.success(`Saved "${name.trim()}"`);
    } finally {
      setSavingNew(false);
    }
  }

  async function remove(filterId: string) {
    const f = filters.find((x) => x.id === filterId);
    if (!f) return;
    if (!window.confirm(`Delete saved filter "${f.name}"?`)) return;
    const res = await fetch(`/api/me/saved-filters?id=${encodeURIComponent(filterId)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setFilters(await res.json());
      toast.success(`Deleted "${f.name}"`);
    } else {
      toast.error('Could not delete filter');
    }
  }

  if (loading) return null;
  if (filters.length === 0 && !canSave) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-border-subtle">
      {filters.map((f) => {
        const active = isActive(f);
        return (
          <div
            key={f.id}
            className={`inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 border ${
              active
                ? 'bg-brand-soft border-brand/40 text-brand font-medium'
                : 'bg-canvas border-border-default text-text-default hover:border-border-strong'
            }`}
          >
            <button
              type="button"
              onClick={() => onApply(f)}
              className="truncate max-w-[110px]"
              title={`${f.name}\nStatus: ${f.status ?? 'all'}${f.tag ? ` · Tag: ${f.tag}` : ''}${f.stage ? ` · Stage #${f.stage}` : ''}`}
            >
              {f.name}
            </button>
            <button
              type="button"
              onClick={() => remove(f.id)}
              aria-label={`Delete ${f.name}`}
              className="text-text-muted hover:text-danger text-[12px] leading-none"
            >
              ×
            </button>
          </div>
        );
      })}
      {canSave && !alreadySaved && (
        <button
          type="button"
          onClick={saveCurrent}
          disabled={savingNew}
          className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 border border-dashed border-border-default text-text-secondary hover:text-text-default hover:border-border-strong disabled:opacity-50"
        >
          {savingNew ? '…' : '+ Save current'}
        </button>
      )}
    </div>
  );
}
