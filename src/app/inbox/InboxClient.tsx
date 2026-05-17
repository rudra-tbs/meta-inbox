'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AppUser, Conversation, Message, Channel } from '@/types';
import { getSupabaseBrowser } from '@/lib/supabase';
import BrandRail from '@/components/BrandRail';
import ChannelTabs from '@/components/ChannelTabs';
import ConversationList from '@/components/ConversationList';
import ChatWindow from '@/components/ChatWindow';

export type StatusFilter = 'all' | 'AI' | 'HUMAN' | 'QUALIFIED' | 'MINE' | 'PENDING';

interface CRMStage { id: number; name: string }

interface InboxClientProps {
  currentUser: AppUser;
}

export default function InboxClient({ currentUser }: InboxClientProps) {
  const [activeBrand] = useState<'TBS'>('TBS');
  const [activeChannel] = useState<Channel>('WA');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [stageFilter, setStageFilter] = useState<number | null>(null);
  const [stages, setStages] = useState<CRMStage[]>([]);
  const [refreshingStages, setRefreshingStages] = useState(false);
  const [search, setSearch] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;

  const fetchConversations = useCallback(async () => {
    const params = new URLSearchParams({
      brand: activeBrand,
      channel: activeChannel,
    });

    if (statusFilter === 'AI' || statusFilter === 'HUMAN') {
      params.set('mode', statusFilter);
    } else if (statusFilter === 'QUALIFIED') {
      params.set('status', 'QUALIFIED');
    } else if (statusFilter === 'MINE') {
      params.set('mine', 'true');
    } else if (statusFilter === 'PENDING') {
      params.set('pending', 'true');
    }

    if (stageFilter != null) params.set('stage', String(stageFilter));
    if (search) params.set('search', search);

    const res = await fetch(`/api/conversations?${params.toString()}`);
    if (res.ok) {
      const data = (await res.json()) as Conversation[];
      // Surface conversations that need attention first:
      // 1. Suggested reply ready (HUMAN mode awaiting action)
      // 2. Callback required
      // 3. Pending human reply
      // 4. Then by last_message_at desc
      const sorted = [...data].sort((a, b) => {
        const priority = (c: Conversation) => {
          if (c.suggested_reply && c.mode === 'HUMAN') return 3;
          if (c.callback_required) return 2;
          if (c.needs_human_reply) return 1;
          return 0;
        };
        const pa = priority(a);
        const pb = priority(b);
        if (pa !== pb) return pb - pa;
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      });
      setConversations(sorted);
    }
    setLoadingConvs(false);
  }, [activeBrand, activeChannel, statusFilter, stageFilter, search]);

  const fetchStages = useCallback(async () => {
    const res = await fetch(`/api/crm-stages?brand=${activeBrand}&channel=${activeChannel}`);
    if (res.ok) {
      const data = await res.json();
      setStages(data);
    }
  }, [activeBrand, activeChannel]);

  const fetchMessages = useCallback(async (conversationId: string) => {
    const res = await fetch(`/api/conversations/${conversationId}/messages`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data);
    }
  }, []);

  async function refreshStagesFromCRM() {
    setRefreshingStages(true);
    try {
      await fetch('/api/conversations/refresh-stages', { method: 'POST' });
      await fetchStages();
      await fetchConversations();
    } finally {
      setRefreshingStages(false);
    }
  }

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    fetchStages();
  }, [fetchStages]);

  useEffect(() => {
    if (selectedId) {
      fetchMessages(selectedId);
    } else {
      setMessages([]);
    }
  }, [selectedId, fetchMessages]);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel('inbox-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => fetchConversations()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const newMsg = payload.new as Message;
          if (newMsg.conversation_id === selectedId) {
            setMessages((prev) => {
              const exists = prev.some((m) => m.id === newMsg.id);
              if (exists) return prev;
              return [...prev, newMsg];
            });
          }
          fetchConversations();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId, fetchConversations]);

  function handleConversationUpdate(updatedConv: Conversation) {
    setConversations((prev) =>
      prev.map((c) => (c.id === updatedConv.id ? updatedConv : c))
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <BrandRail activeBrand={activeBrand} />

      <div className="w-[260px] flex flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-3 pt-3">
          <ChannelTabs activeChannel={activeChannel} />
        </div>

        {/* Stage filter + refresh */}
        {stages.length > 0 && (
          <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100">
            <select
              value={stageFilter ?? ''}
              onChange={(e) => setStageFilter(e.target.value ? Number(e.target.value) : null)}
              className="flex-1 text-[11px] border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="">All stages</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              onClick={refreshStagesFromCRM}
              disabled={refreshingStages}
              title="Refresh stages from CRM"
              className="text-[11px] text-slate-500 hover:text-rose-600 px-1.5 py-1 disabled:opacity-50"
            >
              {refreshingStages ? '...' : '↻'}
            </button>
          </div>
        )}

        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          search={search}
          setSearch={setSearch}
          currentUserId={currentUser.id}
          loading={loadingConvs}
        />
      </div>

      <div className="flex-1 flex flex-col bg-[#F9F6F4] overflow-hidden">
        {selectedConversation ? (
          <ChatWindow
            conversation={selectedConversation}
            currentUser={currentUser}
            messages={messages}
            onModeChange={handleConversationUpdate}
            onAssign={handleConversationUpdate}
            onConversationUpdate={handleConversationUpdate}
            onMessageSent={() => fetchMessages(selectedConversation.id)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-slate-400">
              <div className="text-5xl mb-4">💬</div>
              <p className="text-sm">Select a conversation to start</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
