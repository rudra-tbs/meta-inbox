'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { AppUser, Conversation, Message, ChannelView } from '@/types';
import { getSupabaseBrowser } from '@/lib/supabase';
import BrandRail from '@/components/BrandRail';
import ChannelTabs from '@/components/ChannelTabs';
import ConversationList from '@/components/ConversationList';
import ChatWindow from '@/components/ChatWindow';
import CommandPalette, { type PaletteAction } from '@/components/CommandPalette';
import WelcomeTour from '@/components/WelcomeTour';
import SavedFiltersBar, { type SavedFilter } from '@/components/SavedFiltersBar';
import { toast } from '@/lib/toast';

export type StatusFilter = 'all' | 'AI' | 'HUMAN' | 'QUALIFIED' | 'MINE' | 'PENDING' | 'SNOOZED';

interface CRMStage { id: number; name: string }
interface Brand { id: string; name: string; color: string | null; logo_url: string | null }
interface AssignableUser { id: string; name: string }
interface ConfiguredChannel { brand: string; channel: string; display_name: string | null }

interface InboxClientProps {
  currentUser: AppUser;
}

const ACTIVE_BRAND_STORAGE_KEY = 'inbox.activeBrand';

export default function InboxClient({ currentUser }: InboxClientProps) {
  const isAdmin = currentUser.role === 'ADMIN';
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [activeBrand, setActiveBrand] = useState<string>('');
  const [activeChannel, setActiveChannel] = useState<ChannelView>('WA');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<number | null>(null);
  // Admin-only: filter conversations by assignee. Empty string = no filter,
  // '__unassigned' = literal NULL.
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');
  const [agents, setAgents] = useState<AssignableUser[]>([]);
  const [stages, setStages] = useState<CRMStage[]>([]);
  // Connected (brand, channel) → display_name (typically the phone number).
  // Used to surface the "send a test message to X" hint in the empty inbox
  // state. Loaded once after sign-in.
  const [configuredChannels, setConfiguredChannels] = useState<ConfiguredChannel[]>([]);
  const [refreshingStages, setRefreshingStages] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Bulk selection — IDs of conversations the user has checked. Independent
  // of `selectedId` (which is the currently-open chat).
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const activeChannelRef = useRef<ChannelView>(activeChannel);
  activeChannelRef.current = activeChannel;
  const initialLoadDoneRef = useRef(false);

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;
  const isAllChannels = activeChannel === 'ALL';

  // When ALL channels are shown, group conversations by contact so each contact appears once
  const displayedConversations = useMemo(() => {
    if (!isAllChannels) return conversations;
    const byContact = new Map<string, Conversation>();
    for (const c of conversations) {
      const key = c.contact_id ?? c.id;
      const existing = byContact.get(key);
      if (!existing || new Date(c.last_message_at) > new Date(existing.last_message_at)) {
        byContact.set(key, c);
      }
    }
    return Array.from(byContact.values()).sort(
      (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );
  }, [conversations, isAllChannels]);

  const fetchConversations = useCallback(async () => {
    if (!activeBrand) {
      setConversations([]);
      setLoadingConvs(false);
      return;
    }
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
    if (isAdmin && assigneeFilter) params.set('assignee', assigneeFilter);
    if (debouncedSearch) params.set('search', debouncedSearch);

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
  }, [activeBrand, activeChannel, statusFilter, tagFilter, stageFilter, assigneeFilter, isAdmin, debouncedSearch]);

  // Debounce search so we don't hammer /api/conversations on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const fetchStages = useCallback(async () => {
    if (!activeBrand) { setStages([]); return; }
    const res = await fetch(`/api/crm-stages?brand=${activeBrand}&channel=${activeChannel === 'ALL' ? 'WA' : activeChannel}`);
    if (res.ok) setStages(await res.json());
  }, [activeBrand, activeChannel]);

  // When ALL channels view is active and a contact is selected, fetch interleaved
  // messages from all their conversations. Otherwise fetch only the selected conversation's messages.
  const fetchMessages = useCallback(async (conversationId: string) => {
    setMessagesLoading(true);
    try {
      const inAllView = activeChannelRef.current === 'ALL';
      const conv = conversationsRef.current.find((c) => c.id === conversationId);
      if (inAllView && conv?.contact_id) {
        const res = await fetch(`/api/contacts/${conv.contact_id}/messages`);
        if (res.ok) setMessages(await res.json());
      } else {
        const res = await fetch(`/api/conversations/${conversationId}/messages`);
        if (res.ok) setMessages(await res.json());
      }
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const refreshStagesFromCRM = useCallback(async () => {
    setRefreshingStages(true);
    try {
      await fetch('/api/conversations/refresh-stages', { method: 'POST' });
      await fetchStages();
      await fetchConversations();
    } finally {
      setRefreshingStages(false);
    }
  }, [fetchStages, fetchConversations]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Load the brands the user can switch between. We pick the active brand from
  // localStorage if it's still valid, otherwise fall back to the first one.
  // Also pull the configured-channels list so empty-inbox hints can name the
  // exact phone number to test against.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [brandsRes, stateRes] = await Promise.all([
          fetch('/api/brands'),
          fetch('/api/onboarding/state'),
        ]);
        if (!brandsRes.ok) return;
        const data = (await brandsRes.json()) as Brand[];
        if (cancelled) return;
        setBrands(data);
        if (data.length > 0) {
          const stored =
            typeof window !== 'undefined'
              ? window.localStorage.getItem(ACTIVE_BRAND_STORAGE_KEY)
              : null;
          const valid = stored && data.some((b) => b.id === stored) ? stored : data[0].id;
          setActiveBrand(valid);
        }
        if (stateRes.ok) {
          const stateData = await stateRes.json();
          if (!cancelled) setConfiguredChannels(stateData.configured ?? []);
        }
      } finally {
        if (!cancelled) setLoadingBrands(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Admin-only: load assignable users for the assignee filter dropdown.
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/users?assignable=true');
      if (!res.ok) return;
      const data = (await res.json()) as AssignableUser[];
      if (!cancelled) setAgents(data);
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  function selectBrand(brandId: string) {
    setActiveBrand(brandId);
    setSelectedId(null);
    setAssigneeFilter('');
    setCheckedIds(new Set());
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACTIVE_BRAND_STORAGE_KEY, brandId);
    }
  }

  // Toggle a conversation in the bulk-select set. Memo-light: a new Set per
  // change so React re-renders.
  function toggleCheck(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Prune checked IDs that fell out of the current list (filter change,
  // realtime delete, brand switch). Keeps the bulk-action bar's count
  // consistent with what the user can see.
  useEffect(() => {
    setCheckedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(conversations.map((c) => c.id));
      const next = new Set<string>();
      let changed = false;
      prev.forEach((id) => {
        if (visible.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [conversations]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);
  useEffect(() => { fetchStages(); }, [fetchStages]);

  useEffect(() => {
    if (selectedId) {
      fetchMessages(selectedId);
      const conv = conversationsRef.current.find((c) => c.id === selectedId);
      if (conv && (conv.unread_count ?? 0) > 0) {
        fetch(`/api/conversations/${selectedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unread_count: 0 }),
        }).then(() => {
          setConversations((prev) =>
            prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c))
          );
        });
      }
    } else {
      setMessages([]);
    }
  }, [selectedId, fetchMessages]);

  useEffect(() => {
    if (!loadingConvs) initialLoadDoneRef.current = true;
  }, [loadingConvs]);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel('inbox-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          // INSERT of a new conversation needs the joined data (contact, assigned_user
          // name) so fall back to refetch. UPDATE / DELETE patch local state to avoid
          // a per-event refetch storm.
          if (payload.eventType === 'INSERT') {
            fetchConversations();
            return;
          }
          if (payload.eventType === 'DELETE') {
            setConversations((prev) => prev.filter((c) => c.id !== payload.old?.id));
            return;
          }
          if (payload.eventType === 'UPDATE' && payload.new) {
            const updated = payload.new as Conversation;
            setConversations((prev) => {
              const existing = prev.find((c) => c.id === updated.id);
              if (!existing) {
                // Conversation entered scope (filter change) — refetch to pick it up.
                fetchConversations();
                return prev;
              }
              return prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c));
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const newMsg = (payload.new ?? payload.old) as Message;
          if (!newMsg) return;

          // Refresh the open chat if the message belongs to it.
          if (selectedIdRef.current) {
            const selectedConv = conversationsRef.current.find((c) => c.id === selectedIdRef.current);
            const sameConv = newMsg.conversation_id === selectedIdRef.current;
            const sameContactInAllView =
              activeChannelRef.current === 'ALL' &&
              selectedConv?.contact_id &&
              conversationsRef.current.some((c) => c.id === newMsg.conversation_id && c.contact_id === selectedConv.contact_id);
            if (sameConv || sameContactInAllView) {
              fetchMessages(selectedIdRef.current);
            }
          }

          // Inbound INSERT → browser notification + local list patch.
          if (payload.eventType === 'INSERT') {
            const inScope = conversationsRef.current.some((c) => c.id === newMsg.conversation_id);
            if (!inScope) {
              // New conversation we don't have yet — refetch the list.
              fetchConversations();
              return;
            }

            // Patch the existing conversation row in place (preview + unread).
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== newMsg.conversation_id) return c;
                const inboundBump = newMsg.direction === 'INBOUND' && c.id !== selectedIdRef.current;
                return {
                  ...c,
                  last_message: newMsg.content,
                  last_message_preview: newMsg.content,
                  last_message_at: newMsg.created_at,
                  unread_count: inboundBump ? (c.unread_count ?? 0) + 1 : (c.unread_count ?? 0),
                };
              })
            );

            if (newMsg.direction === 'INBOUND') {
              const isReady =
                initialLoadDoneRef.current &&
                newMsg.conversation_id !== selectedIdRef.current &&
                typeof window !== 'undefined' &&
                'Notification' in window &&
                Notification.permission === 'granted' &&
                document.visibilityState !== 'visible';
              if (isReady) {
                const conv = conversationsRef.current.find((c) => c.id === newMsg.conversation_id);
                const title = conv?.contact_name ? `New message from ${conv.contact_name}` : 'New WhatsApp message';
                new Notification(title, { body: newMsg.content?.slice(0, 80) });
              }
            }
            return;
          }

          // UPDATE on a message (delivery status, etc.) — only patch the open chat.
          if (payload.eventType === 'UPDATE' && newMsg.conversation_id === selectedIdRef.current) {
            setMessages((prev) =>
              prev.map((m) => (m.id === newMsg.id ? { ...m, ...newMsg } : m))
            );
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchConversations, fetchMessages]);

  // Global keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      // ⌘K / Ctrl+K opens palette anywhere
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (inField && e.key !== 'Escape') return;

      const visibleList = activeChannelRef.current === 'ALL'
        ? displayedConversationsRef.current
        : conversationsRef.current;

      if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (visibleList.length === 0) return;
        const idx = visibleList.findIndex((c) => c.id === selectedIdRef.current);
        const next = idx < 0 ? 0 : Math.min(idx + 1, visibleList.length - 1);
        setSelectedId(visibleList[next].id);
      } else if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (visibleList.length === 0) return;
        const idx = visibleList.findIndex((c) => c.id === selectedIdRef.current);
        const prev = idx <= 0 ? 0 : idx - 1;
        setSelectedId(visibleList[prev].id);
      } else if (e.key === 't' || e.key === 'T') {
        const conv = visibleList.find((c) => c.id === selectedIdRef.current);
        if (!conv) return;
        const newMode = conv.mode === 'AI' ? 'HUMAN' : 'AI';
        fetch(`/api/conversations/${conv.id}/mode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: newMode }),
        }).then(() => fetchConversations());
      } else if (e.key === 'r' || e.key === 'R') {
        const ta = document.querySelector('textarea[placeholder*="message" i], textarea[placeholder*="suggestion" i]') as HTMLTextAreaElement | null;
        if (ta) { e.preventDefault(); ta.focus(); }
      } else if (e.key === 'Escape') {
        if (!inField) setSelectedId(null);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fetchConversations]);

  // Keep displayedConversations in a ref for keyboard handler
  const displayedConversationsRef = useRef<Conversation[]>([]);
  displayedConversationsRef.current = displayedConversations;

  function handleConversationUpdate(updatedConv: Conversation) {
    setConversations((prev) => prev.map((c) => (c.id === updatedConv.id ? updatedConv : c)));
  }

  const tagsInUse = Array.from(new Set(conversations.flatMap((c) => c.tags ?? []))).sort();

  // Command palette actions. The list is dynamic: it changes as the
  // selected conversation, brand, and stage list change. The palette
  // itself only renders actions whose score >= 0 (fuzzy match passes).
  const paletteActions: PaletteAction[] = useMemo(() => {
    const list: PaletteAction[] = [
      {
        id: 'toggle-mode',
        label: 'Toggle AI / Human on selected',
        hint: 'T',
        run: ({ selectedConversation }) => {
          if (!selectedConversation) return;
          const newMode = selectedConversation.mode === 'AI' ? 'HUMAN' : 'AI';
          fetch(`/api/conversations/${selectedConversation.id}/mode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: newMode }),
          })
            .then(() => fetchConversations())
            .then(() => toast.success(`Mode → ${newMode}`));
        },
      },
      // Snooze presets. Adding 1h alongside the existing button so a
      // power-user can pick any duration without touching the mouse.
      ...[
        { hours: 1, label: '1 hour' },
        { hours: 3, label: '3 hours' },
        { hours: 24, label: '1 day' },
        { hours: 168, label: '1 week' },
      ].map((preset) => ({
        id: `snooze-${preset.hours}h`,
        label: `Snooze selected · ${preset.label}`,
        run: ({ selectedConversation }: { selectedConversation: Conversation | null }) => {
          if (!selectedConversation) return;
          const until = new Date(Date.now() + preset.hours * 3600 * 1000).toISOString();
          fetch(`/api/conversations/${selectedConversation.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ snoozed_until: until }),
          })
            .then(() => fetchConversations())
            .then(() => toast.success(`Snoozed ${preset.label}`));
        },
      })),
      {
        id: 'assign-to-me',
        label: 'Assign selected to me',
        run: ({ selectedConversation }) => {
          if (!selectedConversation) return;
          fetch(`/api/conversations/${selectedConversation.id}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id }),
          })
            .then(() => fetchConversations())
            .then(() => toast.success(`Assigned to ${currentUser.name}`));
        },
      },
      {
        id: 'unassign',
        label: 'Unassign selected',
        run: ({ selectedConversation }) => {
          if (!selectedConversation) return;
          fetch(`/api/conversations/${selectedConversation.id}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: null }),
          })
            .then(() => fetchConversations())
            .then(() => toast.success('Unassigned'));
        },
      },
      {
        id: 'refresh-stages',
        label: 'Refresh CRM stages',
        run: () => refreshStagesFromCRM(),
      },
      // Stage-change shortcuts. Built from the current pipeline's
      // stages — only appears when a conversation is pushed to CRM.
      // We don't know the selected conversation here (it's passed via
      // the run callback), so we render every stage as its own action
      // and bail out at run time if there's no pushed conversation.
      ...stages.map((stage) => ({
        id: `move-stage-${stage.id}`,
        label: `Move stage → ${stage.name}`,
        hint: `#${stage.id}`,
        run: ({ selectedConversation }: { selectedConversation: Conversation | null }) => {
          if (!selectedConversation) return;
          if (!selectedConversation.pushed_to_crm || !selectedConversation.crm_deal_id) {
            toast.error('Conversation not pushed to CRM', {
              description: 'Push to CRM first from the conversation header.',
            });
            return;
          }
          fetch(`/api/conversations/${selectedConversation.id}/crm-stage`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stage_id: stage.id }),
          })
            .then(async (res) => {
              const data = await res.json().catch(() => ({}));
              if (res.ok) {
                toast.success(`Stage → ${stage.name}`);
                fetchConversations();
              } else if (data?.missing) {
                // The matrix tripped. Tell the operator what's missing
                // and where to fix it.
                toast.error(data?.error ?? 'Cannot move stage', {
                  description: 'Open the conversation and click the stage dropdown to fill the required fields.',
                });
              } else {
                toast.error(data?.error ?? 'Stage change failed');
              }
            });
        },
      })),
      // Brand switching — one entry per accessible brand.
      ...brands
        .filter((b) => b.id !== activeBrand)
        .map((brand) => ({
          id: `switch-brand-${brand.id}`,
          label: `Switch brand → ${brand.name}`,
          run: () => {
            setActiveBrand(brand.id);
            try { window.localStorage.setItem(ACTIVE_BRAND_STORAGE_KEY, brand.id); } catch {}
            setSelectedId(null);
          },
        })),
      {
        id: 'go-pending',
        label: 'Filter: Pending',
        run: () => setStatusFilter('PENDING'),
      },
      {
        id: 'go-mine',
        label: 'Filter: Mine',
        run: () => setStatusFilter('MINE'),
      },
      {
        id: 'go-all',
        label: 'Filter: All conversations',
        run: () => { setStatusFilter('all'); setTagFilter(null); setStageFilter(null); },
      },
    ];
    return list;
  }, [stages, brands, activeBrand, currentUser.id, currentUser.name, fetchConversations, refreshStagesFromCRM]);

  const hasSecondaryFilters = tagsInUse.length > 0 || stages.length > 0 || isAdmin;

  return (
    <div className="flex h-screen overflow-hidden bg-elevated">
      <WelcomeTour userName={currentUser.name} />
      <BrandRail
        brands={brands}
        activeBrand={activeBrand}
        onSelectBrand={selectBrand}
        currentUser={currentUser}
        loading={loadingBrands}
      />

      <div
        className={`flex flex-col border-r border-border-default bg-elevated
          ${selectedId && !mobileSidebarOpen ? 'hidden md:flex' : 'flex'}
          w-full md:w-[280px]`}
      >
        <div className="border-b border-border-default px-3 pt-3">
          <ChannelTabs
            activeChannel={activeChannel}
            onChange={(c) => {
              setActiveChannel(c);
              setSelectedId(null);
              setCheckedIds(new Set());
            }}
          />
        </div>

        <SavedFiltersBar
          currentStatus={statusFilter}
          currentTag={tagFilter}
          currentStage={stageFilter}
          onApply={(f: SavedFilter) => {
            setStatusFilter((f.status ?? 'all') as StatusFilter);
            setTagFilter(f.tag ?? null);
            setStageFilter(f.stage ?? null);
          }}
        />

        {hasSecondaryFilters && (
          <div className="flex flex-col gap-1 px-3 py-2 border-b border-border-subtle">
            <div className="flex items-center gap-1">
              {tagsInUse.length > 0 && (
                <select
                  value={tagFilter ?? ''}
                  onChange={(e) => setTagFilter(e.target.value || null)}
                  className="flex-1 text-[11px] text-text-default border border-border-default rounded px-2 py-1 bg-elevated focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-border-strong"
                >
                  <option value="">All tags</option>
                  {tagsInUse.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              )}
              {stages.length > 0 && (
                <select
                  value={stageFilter ?? ''}
                  onChange={(e) => setStageFilter(e.target.value ? Number(e.target.value) : null)}
                  className="flex-1 text-[11px] text-text-default border border-border-default rounded px-2 py-1 bg-elevated focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-border-strong"
                >
                  <option value="">All stages</option>
                  {stages.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                </select>
              )}
              <button
                onClick={refreshStagesFromCRM}
                disabled={refreshingStages}
                title="Refresh stages from CRM"
                className="text-[11px] text-text-secondary hover:text-brand px-1.5 py-1 disabled:opacity-50"
              >
                {refreshingStages ? '...' : '↻'}
              </button>
            </div>
            {isAdmin && (
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                title="Filter by assignee (admin)"
                className="w-full text-[11px] text-text-default border border-border-default rounded px-2 py-1 bg-elevated focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-border-strong"
              >
                <option value="">All assignees</option>
                <option value="__unassigned">Unassigned</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <ConversationList
          conversations={displayedConversations}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); setMobileSidebarOpen(false); }}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          search={search}
          setSearch={setSearch}
          currentUserId={currentUser.id}
          loading={loadingConvs}
          checkedIds={checkedIds}
          onToggleCheck={toggleCheck}
          onClearChecks={() => setCheckedIds(new Set())}
          onBulkDone={() => { fetchConversations(); }}
          noBrandsAssigned={!loadingBrands && brands.length === 0}
          activeChannelLabel={
            configuredChannels.find(
              (c) => c.brand === activeBrand && (isAllChannels ? true : c.channel === activeChannel),
            )?.display_name ?? null
          }
        />
      </div>

      <div className={`flex-1 flex flex-col bg-warm overflow-hidden ${selectedId || mobileSidebarOpen ? 'flex' : 'hidden md:flex'}`}>
        {selectedConversation ? (
          <ChatWindow
            conversation={selectedConversation}
            currentUser={currentUser}
            messages={messages}
            messagesLoading={messagesLoading}
            onModeChange={handleConversationUpdate}
            onAssign={handleConversationUpdate}
            onConversationUpdate={handleConversationUpdate}
            onMessageSent={() => fetchMessages(selectedConversation.id)}
            onBack={() => setMobileSidebarOpen(true)}
            showChannelTags={isAllChannels}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="text-center max-w-sm">
              <div className="w-14 h-14 rounded-2xl bg-elevated border border-border-default shadow-sm flex items-center justify-center mx-auto mb-4" aria-hidden>
                <svg className="w-7 h-7 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-text-primary">Select a conversation</p>
              <p className="text-[12px] text-text-secondary mt-1 leading-snug">
                Pick one from the sidebar to read history and reply.
              </p>
              <div className="mt-5 hidden md:inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
                <span><kbd className="px-1 py-0.5 bg-muted rounded text-text-secondary">⌘K</kbd> palette</span>
                <span><kbd className="px-1 py-0.5 bg-muted rounded text-text-secondary">J</kbd>/<kbd className="px-1 py-0.5 bg-muted rounded text-text-secondary">K</kbd> nav</span>
                <span><kbd className="px-1 py-0.5 bg-muted rounded text-text-secondary">T</kbd> toggle</span>
                <span><kbd className="px-1 py-0.5 bg-muted rounded text-text-secondary">R</kbd> reply</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        conversations={conversations}
        onSelectConversation={(id) => setSelectedId(id)}
        selectedConversation={selectedConversation}
        actions={paletteActions}
      />
    </div>
  );
}
