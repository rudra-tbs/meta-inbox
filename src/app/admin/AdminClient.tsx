'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { AppUser } from '@/types';
import UsersTab from './tabs/UsersTab';
import PipelinesTab from './tabs/PipelinesTab';
import ChannelsTab from './tabs/ChannelsTab';
import BrandContextsTab from './tabs/BrandContextsTab';
import TemplatesTab from './tabs/TemplatesTab';
import TagsTab from './tabs/TagsTab';
import ReportsTab from './tabs/ReportsTab';
import ActivityTab from './tabs/ActivityTab';
import SystemTab from './tabs/SystemTab';

type TabId = 'users' | 'pipelines' | 'channels' | 'contexts' | 'templates' | 'tags' | 'reports' | 'activity' | 'system';

interface AdminClientProps {
  currentUser: AppUser;
}

const TABS: Array<{ id: TabId; label: string; sub: string }> = [
  { id: 'users',     label: 'Users',          sub: 'Roles, access, deactivation, invites + per-agent metrics' },
  { id: 'channels',  label: 'Channels',       sub: 'Connect WhatsApp + Instagram (tokens via Vercel env vars)' },
  { id: 'pipelines', label: 'Pipelines',      sub: 'Brand → CRM pipeline mapping' },
  { id: 'contexts',  label: 'Brand contexts', sub: 'Per-brand AI system prompts' },
  { id: 'templates', label: 'Templates',      sub: 'Reply templates agents pull via /' },
  { id: 'tags',      label: 'Tags',           sub: 'Master list of conversation tags (prevents #vip/#VIP drift)' },
  { id: 'reports',   label: 'Reports',        sub: 'Qualification, response time, CRM conversion per brand and agent' },
  { id: 'activity',  label: 'Activity',       sub: 'Admin audit log — who changed what, when' },
  { id: 'system',    label: 'System',         sub: 'Env vars, DB connectivity, migrations, recent send failures' },
];

export default function AdminClient({ currentUser }: AdminClientProps) {
  const router = useRouter();
  const [active, setActive] = useState<TabId>('users');
  const activeTab = TABS.find((t) => t.id === active)!;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border-default bg-elevated">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.push('/inbox')}
              className="inline-flex items-center gap-1.5 text-text-secondary hover:text-text-primary text-sm whitespace-nowrap"
              aria-label="Back to inbox"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden />
              Inbox
            </button>
            <span className="w-px h-4 bg-border-default" aria-hidden />
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

      <main className="max-w-6xl mx-auto px-6 py-6 md:grid md:grid-cols-[240px_1fr] md:gap-8">
        {/* Sidenav */}
        <nav
          aria-label="Admin sections"
          className="md:sticky md:top-6 md:self-start"
        >
          {/* Mobile: horizontal scroll. md+: vertical list. */}
          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible border-b md:border-b-0 border-border-default md:border-none pb-3 md:pb-0 mb-4 md:mb-0">
            {TABS.map((t) => {
              const isActive = active === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActive(t.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`
                    relative text-left whitespace-nowrap md:whitespace-normal
                    flex-shrink-0 md:flex-shrink
                    px-3 py-2 md:px-3 md:py-2.5
                    rounded-md transition-colors
                    ${isActive
                      ? 'bg-brand-soft text-text-primary md:before:absolute md:before:left-0 md:before:top-1.5 md:before:bottom-1.5 md:before:w-0.5 md:before:rounded-r md:before:bg-brand'
                      : 'text-text-secondary hover:text-text-primary hover:bg-canvas'}
                  `}
                >
                  <span className={`block text-sm font-medium ${isActive ? 'text-text-primary' : ''}`}>
                    {t.label}
                  </span>
                  <span className="hidden md:block text-[11px] text-text-muted leading-snug mt-0.5">
                    {t.sub}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <section className="min-w-0">
          <div className="mb-6 pb-4 border-b border-border-default">
            <h1 className="text-xl font-semibold text-text-primary tracking-tight">{activeTab.label}</h1>
            <p className="text-sm text-text-secondary mt-1 leading-relaxed">{activeTab.sub}</p>
          </div>

          {active === 'users'     && <UsersTab currentUserId={currentUser.id} />}
          {active === 'channels'  && <ChannelsTab />}
          {active === 'pipelines' && <PipelinesTab />}
          {active === 'contexts'  && <BrandContextsTab />}
          {active === 'templates' && <TemplatesTab />}
          {active === 'tags'      && <TagsTab />}
          {active === 'reports'   && <ReportsTab />}
          {active === 'activity'  && <ActivityTab />}
          {active === 'system'    && <SystemTab />}
        </section>
      </main>
    </div>
  );
}
