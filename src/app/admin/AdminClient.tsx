'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AppUser } from '@/types';
import Button from '@/components/ui/Button';
import UsersTab from './tabs/UsersTab';
import PipelinesTab from './tabs/PipelinesTab';
import ChannelsTab from './tabs/ChannelsTab';
import BrandContextsTab from './tabs/BrandContextsTab';
import SystemTab from './tabs/SystemTab';

type TabId = 'users' | 'pipelines' | 'channels' | 'contexts' | 'system';

interface AdminClientProps {
  currentUser: AppUser;
}

const TABS: Array<{ id: TabId; label: string; sub: string }> = [
  { id: 'users',     label: 'Users',          sub: 'Roles, access, deactivation, invites' },
  { id: 'channels',  label: 'Channels',       sub: 'Connect WhatsApp + Instagram, rotate tokens' },
  { id: 'pipelines', label: 'Pipelines',      sub: 'Brand → CRM pipeline mapping' },
  { id: 'contexts',  label: 'Brand contexts', sub: 'Per-brand AI system prompts' },
  { id: 'system',    label: 'System',         sub: 'Env vars, DB connectivity, migrations' },
];

export default function AdminClient({ currentUser }: AdminClientProps) {
  const router = useRouter();
  const [active, setActive] = useState<TabId>('users');

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border-default bg-elevated">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.push('/inbox')}
              className="text-text-secondary hover:text-text-primary text-sm whitespace-nowrap"
              aria-label="Back to inbox"
            >
              ← Inbox
            </button>
            <span className="text-sm font-semibold text-text-primary truncate">Admin panel</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-brand-soft text-brand">
              {currentUser.role}
            </span>
            <span className="text-[11px] text-text-muted hidden md:inline truncate max-w-[200px]">
              {currentUser.email}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex flex-wrap gap-1 border-b border-border-default mb-6 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                active === t.id
                  ? 'border-brand text-text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
              title={t.sub}
            >
              {t.label}
            </button>
          ))}
        </div>

        {active === 'users'     && <UsersTab currentUserId={currentUser.id} />}
        {active === 'channels'  && <ChannelsTab />}
        {active === 'pipelines' && <PipelinesTab />}
        {active === 'contexts'  && <BrandContextsTab />}
        {active === 'system'    && <SystemTab />}

        <div className="mt-10 pt-6 border-t border-border-default">
          <Button variant="ghost" size="sm" onClick={() => router.push('/inbox')}>
            ← Done
          </Button>
        </div>
      </main>
    </div>
  );
}
