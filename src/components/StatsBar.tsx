'use client';

import { useEffect, useState } from 'react';
import type { Conversation } from '@/types';

interface StatsBarProps {
  conversations: Conversation[];
}

export default function StatsBar({ conversations }: StatsBarProps) {
  const [todayStats, setTodayStats] = useState({
    total: 0,
    qualified: 0,
    aiHandled: 0,
    handedOff: 0,
  });

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayConvs = conversations.filter((c) => {
      const created = new Date(c.created_at);
      return created >= today;
    });

    setTodayStats({
      total: todayConvs.length,
      qualified: todayConvs.filter((c) => c.status === 'QUALIFIED').length,
      aiHandled: todayConvs.filter((c) => c.mode === 'AI').length,
      handedOff: todayConvs.filter((c) => c.mode === 'HUMAN').length,
    });
  }, [conversations]);

  return (
    <div className="border-t border-slate-200 p-3">
      <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-2">
        Today
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xl font-bold text-slate-700">{todayStats.total}</p>
          <p className="text-xs text-slate-400">Total</p>
        </div>
        <div>
          <p className="text-xl font-bold text-emerald-600">{todayStats.qualified}</p>
          <p className="text-xs text-slate-400">Qualified</p>
        </div>
        <div>
          <p className="text-xl font-bold text-rose-600">{todayStats.aiHandled}</p>
          <p className="text-xs text-slate-400">AI handled</p>
        </div>
        <div>
          <p className="text-xl font-bold text-amber-500">{todayStats.handedOff}</p>
          <p className="text-xs text-slate-400">Handed off</p>
        </div>
      </div>
    </div>
  );
}
