'use client';

import type { Conversation } from '@/types';
import type { StatusFilter } from '@/app/inbox/InboxClient';
import ConversationItem from './ConversationItem';
import FilterPills from './FilterPills';
import StatsBar from './StatsBar';

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
}: ConversationListProps) {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"
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
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500 bg-slate-50"
          />
        </div>
      </div>

      {/* Filter pills */}
      <FilterPills value={statusFilter} onChange={setStatusFilter} />

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-20 text-xs text-slate-400">
            Loading...
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-slate-400">
            No conversations found
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              selected={conv.id === selectedId}
              onClick={() => onSelect(conv.id)}
            />
          ))
        )}
      </div>

      {/* Stats bar */}
      <StatsBar conversations={conversations} />
    </div>
  );
}
