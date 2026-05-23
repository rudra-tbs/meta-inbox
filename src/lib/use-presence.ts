'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase';

// Per-channel Supabase Realtime presence. Tracks the current user
// onto a named channel and returns the live list of *other* users
// on the same channel. The inbox uses one channel per conversation
// (e.g. presence:conv:<uuid>) so two RMs opening the same
// conversation see each other's avatars in the ChatWindow header.
//
// Usage:
//   const others = usePresence({
//     channel: `presence:conv:${conversationId}`,
//     self: { user_id, name },
//   });
//
// Returns an array, deduped by user_id, sorted by joined_at ascending.
// Self is excluded so the calling component doesn't have to filter.
// Empty when the channel hasn't synced yet OR the user is alone.

export interface PresenceUser {
  user_id: string;
  name: string;
  joined_at: number;
}

interface UsePresenceOptions {
  channel: string | null;
  self: { user_id: string; name: string } | null;
}

export function usePresence({ channel, self }: UsePresenceOptions): PresenceUser[] {
  const [others, setOthers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!channel || !self) {
      setOthers([]);
      return;
    }
    const supabase = getSupabaseBrowser();
    const presenceKey = self.user_id;
    const realtime = supabase.channel(channel, {
      config: { presence: { key: presenceKey } },
    });

    function recomputeOthers() {
      const state = realtime.presenceState() as Record<string, Array<Record<string, unknown>>>;
      const flat: PresenceUser[] = [];
      const seen = new Set<string>();
      for (const key of Object.keys(state)) {
        if (key === presenceKey) continue;
        // Each key holds an array of metas (one per tab/session for that user).
        // Take the earliest joined_at so the avatar order is stable.
        const metas = state[key] ?? [];
        if (metas.length === 0) continue;
        let earliest: Record<string, unknown> | null = null;
        for (const m of metas) {
          if (!earliest || (Number(m.joined_at) < Number(earliest.joined_at))) earliest = m;
        }
        if (!earliest) continue;
        const userId = typeof earliest.user_id === 'string' ? earliest.user_id : key;
        if (seen.has(userId)) continue;
        seen.add(userId);
        flat.push({
          user_id: userId,
          name: typeof earliest.name === 'string' ? earliest.name : 'Someone',
          joined_at: Number(earliest.joined_at) || 0,
        });
      }
      flat.sort((a, b) => a.joined_at - b.joined_at);
      setOthers(flat);
    }

    realtime
      .on('presence', { event: 'sync' }, recomputeOthers)
      .on('presence', { event: 'join' }, recomputeOthers)
      .on('presence', { event: 'leave' }, recomputeOthers)
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await realtime.track({
            user_id: self.user_id,
            name: self.name,
            joined_at: Date.now(),
          });
        }
      });

    return () => {
      // Best-effort untrack; channel.unsubscribe() also clears
      // presence server-side, but explicit untrack is faster for
      // other clients to notice we left.
      realtime.untrack().catch(() => {});
      supabase.removeChannel(realtime);
      setOthers([]);
    };
    // self is intentionally destructured into its primitive parts so
    // referential identity of the parent object doesn't churn the
    // subscription on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, self?.user_id, self?.name]);

  return others;
}
