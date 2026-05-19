'use client';

import type { Conversation } from '@/types';
import type { StatusFilter } from '@/app/inbox/InboxClient';
import ConversationItem from './ConversationItem';
import FilterPills from './FilterPills';
import StatsBar from './StatsBar';
import BulkActionBar from './BulkActionBar';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (filter: StatusFilter) => void;
  search: string;
  setSearch: (s: string) => void;
  currentUserId: string;
  loading?: boolean;
  // Bulk selection
  checkedIds: Set<string>;
  onToggleCheck: (id: string) => void;
  onClearChecks: () => void;
  onBulkDone: () => void;
  // Empty-state hints
  noBrandsAssigned?: boolean;
  activeChannelLabel?: string | null;
}

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  statusFilter,
  setStatusFilter,
  search,
  setSearch,
  loading,
  checkedIds,
  onToggleCheck,
  onClearChecks,
  onBulkDone,
  noBrandsAssigned,
  activeChannelLabel,
}: ConversationListProps) {
  const selectionActive = checkedIds.size > 0;
  const checkedConversations = conversations.filter((c) => checkedIds.has(c.id));
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-8 pr-3 py-1.5 text-xs text-text-default placeholder:text-text-muted bg-muted border border-transparent rounded-md focus:outline-none focus:bg-elevated focus:border-border-strong focus:ring-2 focus:ring-brand/15 transition-all"
          />
        </div>
      </div>

      {/* Filter pills */}
      <FilterPills value={statusFilter} onChange={setStatusFilter} />

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-6 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-1.5 pt-1">
                  <div className="h-3 bg-muted rounded w-2/3" />
                  <div className="h-2.5 bg-muted rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <EmptyConversations
            search={search}
            statusFilter={statusFilter}
            noBrandsAssigned={!!noBrandsAssigned}
            activeChannelLabel={activeChannelLabel ?? null}
          />
        ) : (
          conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              selected={conv.id === selectedId}
              onClick={() => onSelect(conv.id)}
              selectionActive={selectionActive}
              checked={checkedIds.has(conv.id)}
              onToggleCheck={() => onToggleCheck(conv.id)}
            />
          ))
        )}
      </div>

      {/* Bulk action bar replaces the stats bar whenever something's selected. */}
      {selectionActive ? (
        <BulkActionBar
          selectedConversations={checkedConversations}
          onClear={onClearChecks}
          onDone={onBulkDone}
        />
      ) : (
        <StatsBar conversations={conversations} />
      )}
    </div>
  );
}

function EmptyConversations({
  search,
  statusFilter,
  noBrandsAssigned,
  activeChannelLabel,
}: {
  search: string;
  statusFilter: StatusFilter;
  noBrandsAssigned: boolean;
  activeChannelLabel: string | null;
}) {
  const filtered = !!search || statusFilter !== 'all';
  return (
    <div className="px-6 py-10 flex flex-col items-center text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3" aria-hidden>
        <svg className="w-6 h-6 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </div>
      {noBrandsAssigned ? (
        <>
          <p className="text-sm font-medium text-text-primary">No brands assigned yet</p>
          <p className="text-[12px] text-text-secondary mt-1 leading-snug max-w-[220px]">
            Ask an admin to grant you access — they can do it from <strong>/admin → Users</strong>.
          </p>
        </>
      ) : filtered ? (
        <>
          <p className="text-sm font-medium text-text-primary">No conversations match</p>
          <p className="text-[12px] text-text-secondary mt-1 leading-snug">
            Clear the search or filter to see all conversations.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-text-primary">Waiting for first message</p>
          <p className="text-[12px] text-text-secondary mt-1 leading-snug max-w-[240px]">
            {activeChannelLabel ? (
              <>Send a test message to <strong className="text-text-primary">{activeChannelLabel}</strong> to verify the webhook is wired up. New conversations land here.</>
            ) : (
              <>When a lead messages your connected number, the conversation lands here.</>
            )}
          </p>
          <a
            href="/settings"
            className="mt-3 text-[11px] text-brand font-medium hover:underline"
          >
            Manage brand access →
          </a>
        </>
      )}
    </div>
  );
}
