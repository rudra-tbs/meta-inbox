'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppUser, Conversation, Message, Channel } from '@/types';
import { getSupabaseBrowser } from '@/lib/supabase';
import BrandRail from '@/components/BrandRail';
import ChannelTabs from '@/components/ChannelTabs';
import ConversationList from '@/components/ConversationList';
import ChatWindow from '@/components/ChatWindow';

export type StatusFilter = 'all' | 'AI' | 'HUMAN' | 'QUALIFIED' | 'MINE' | 'PENDING' | 'SNOOZED';

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
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<number | null>(null);
  const [stages, setStages] = useState<CRMStage[]>([]);
  const [refreshingStages, setRefreshingStages] = useState(false);
  const [search, setSearch] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);

  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const initialLoadDoneRef = useRef(false);

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
    } else if (statusFilter === 'SNOOZED') {
      params.set('snoozed', 'true');
    }
    if (tagFilter) params.set('tag', tagFilter);
    if (stageFilter != null) params.set('stage', String(stageFilter));
    if (search) params.set('search', search);

    const res = await fetch(`/api/conversations?${params.toString()}`);
    if (res.ok) {
      const data = (await res.json()) as Conversation[];
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
  }, [activeBrand, activeChannel, statusFilter, tagFilter, stageFilter, search]);

  const fetchStages = useCallback(async () => {
    const res = await fetch(`/api/crm-stages?brand=${activeBrand}&channel=${activeChannel}`);
    if (res.ok) setStages(await res.json());
  }, [activeBrand, activeChannel]);

  const fetchMessages = useCallback(async (conversationId: string) => {
    const res = await fetch(`/api/conversations/${conversationId}/messages`);
    if (res.ok) setMessages(await res.json());
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

  // Browser notifications — ask once on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);
  useEffect(() => { fetchStages(); }, [fetchStages]);

  useEffect(() => {
    if (selectedId) fetchMessages(selectedId);
    else setMessages([]);
  }, [selectedId, fetchMessages]);

  // Mark initial load done after first conversations fetch completes
  useEffect(() => {
    if (!loadingConvs) initialLoadDoneRef.current = true;
  }, [loadingConvs]);

  // Realtime
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
        { event: '*', schema: 'public', table: 'messages' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const newMsg = (payload.new ?? payload.old) as Message;
          if (newMsg && newMsg.conversation_id === selectedIdRef.current) {
            // Refetch to capture status changes too (delivered/read updates)
            fetchMessages(newMsg.conversation_id);
          }
          // Browser notification on new INBOUND in another conversation
          if (
            payload.eventType === 'INSERT' &&
            payload.new?.direction === 'INBOUND' &&
            initialLoadDoneRef.current &&
            payload.new.conversation_id !== selectedIdRef.current &&
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted' &&
            document.visibilityState !== 'visible'
          ) {
            const conv = conversationsRef.current.find((c) => c.id === payload.new.conversation_id);
            const title = conv?.contact_name ? `New message from ${conv.contact_name}` : 'New WhatsApp message';
            new Notification(title, { body: payload.new.content?.slice(0, 80) });
          }
          fetchConversations();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchConversations, fetchMessages]);

  // Keyboard shortcuts: J/K navigate · T toggle mode · R focus reply · Esc deselect · ? help
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (inField && e.key !== 'Escape') return;

      if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') {
        e.preventDefault();
        const list = conversationsRef.current;
        if (list.length === 0) return;
        const idx = list.findIndex((c) => c.id === selectedIdRef.current);
        const next = idx < 0 ? 0 : Math.min(idx + 1, list.length - 1);
        setSelectedId(list[next].id);
      } else if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = conversationsRef.current;
        if (list.length === 0) return;
        const idx = list.findIndex((c) => c.id === selectedIdRef.current);
        const prev = idx <= 0 ? 0 : idx - 1;
        setSelectedId(list[prev].id);
      } else if (e.key === 't' || e.key === 'T') {
        const conv = conversationsRef.current.find((c) => c.id === selectedIdRef.current);
        if (!conv) return;
        const newMode = conv.mode === 'AI' ? 'HUMAN' : 'AI';
        fetch(`/api/conversations/${conv.id}/mode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: newMode }),
        }).then(() => fetchConversations());
      } else if (e.key === 'r' || e.key === 'R') {
        const ta = document.querySelector('textarea[placeholder*="message" i], textarea[placeholder*="suggestion" i]') as HTMLTextAreaElement | null;
        if (ta) {
          e.preventDefault();
          ta.focus();
        }
      } else if (e.key === 'Escape') {
        if (!inField) setSelectedId(null);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fetchConversations]);

  function handleConversationUpdate(updatedConv: Conversation) {
    setConversations((prev) => prev.map((c) => (c.id === updatedConv.id ? updatedConv : c)));
  }

  // Distinct tags across loaded conversations
  const tagsInUse = Array.from(new Set(conversations.flatMap((c) => c.tags ?? []))).sort();

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <BrandRail activeBrand={activeBrand} />

      {/* Sidebar — hidden on mobile when chat is open */}
      <div
        className={`flex flex-col border-r border-slate-200 bg-white
          ${selectedId && !mobileSidebarOpen ? 'hidden md:flex' : 'flex'}
          w-full md:w-[280px]`}
      >
        <div className="border-b border-slate-200 px-3 pt-3">
          <ChannelTabs activeChannel={activeChannel} />
        </div>

        {/* Filter strip: tags + stages */}
        {(tagsInUse.length > 0 || stages.length > 0) && (
          <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100">
            {tagsInUse.length > 0 && (
              <select
                value={tagFilter ?? ''}
                onChange={(e) => setTagFilter(e.target.value || null)}
                className="flex-1 text-[11px] border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-rose-500"
              >
                <option value="">All tags</option>
                {tagsInUse.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            )}
            {stages.length > 0 && (
              <select
                value={stageFilter ?? ''}
                onChange={(e) => setStageFilter(e.target.value ? Number(e.target.value) : null)}
                className="flex-1 text-[11px] border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-rose-500"
              >
                <option value="">All stages</option>
                {stages.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
            )}
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
          onSelect={(id) => {
            setSelectedId(id);
            setMobileSidebarOpen(false);
          }}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          search={search}
          setSearch={setSearch}
          currentUserId={currentUser.id}
          loading={loadingConvs}
        />
      </div>

      <div className={`flex-1 flex flex-col bg-[#F9F6F4] overflow-hidden ${selectedId || mobileSidebarOpen ? 'flex' : 'hidden md:flex'}`}>
        {selectedConversation ? (
          <ChatWindow
            conversation={selectedConversation}
            currentUser={currentUser}
            messages={messages}
            onModeChange={handleConversationUpdate}
            onAssign={handleConversationUpdate}
            onConversationUpdate={handleConversationUpdate}
            onMessageSent={() => fetchMessages(selectedConversation.id)}
            onBack={() => setMobileSidebarOpen(true)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-slate-400">
              <div className="text-5xl mb-4">💬</div>
              <p className="text-sm">Select a conversation to start</p>
              <p className="text-xs mt-3 text-slate-300">
                Shortcuts: <kbd className="bg-slate-100 px-1 rounded">J</kbd> next ·{' '}
                <kbd className="bg-slate-100 px-1 rounded">K</kbd> prev ·{' '}
                <kbd className="bg-slate-100 px-1 rounded">T</kbd> toggle mode ·{' '}
                <kbd className="bg-slate-100 px-1 rounded">R</kbd> reply
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
