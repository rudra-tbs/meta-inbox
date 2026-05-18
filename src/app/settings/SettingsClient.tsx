'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AppUser } from '@/types';
import Button from '@/components/ui/Button';
import ProfileTab from './tabs/ProfileTab';
import ChannelsTab from './tabs/ChannelsTab';
import UsersTab from './tabs/UsersTab';
import AdminChannelsTab from './tabs/AdminChannelsTab';
import BrandContextsTab from './tabs/BrandContextsTab';

type TabId = 'profile' | 'channels' | 'users' | 'admin-channels' | 'brand-contexts';

interface SettingsClientProps {
  currentUser: AppUser;
}

interface Me {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'AGENT';
  access: Array<{ brand: string; channel: string }>;
}

export default function SettingsClient({ currentUser }: SettingsClientProps) {
  const router = useRouter();
  const [active, setActive] = useState<TabId>('profile');
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/me');
      if (res.ok) setMe(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  const isAdmin = currentUser.role === 'ADMIN';
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'profile', label: 'Profile' },
    { id: 'channels', label: 'My channels' },
    ...(isAdmin
      ? ([
          { id: 'users', label: 'Users' },
          { id: 'admin-channels', label: 'All channels' },
          { id: 'brand-contexts', label: 'Brand contexts' },
        ] as Array<{ id: TabId; label: string }>)
      : []),
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border-default bg-elevated">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/inbox')}
              className="text-text-secondary hover:text-text-primary text-sm"
              aria-label="Back to inbox"
            >
              ← Inbox
            </button>
            <span className="text-sm font-semibold text-text-primary">Settings</span>
          </div>
          <span className="text-[11px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-muted text-text-secondary">
            {currentUser.role}
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6">
        <div className="flex border-b border-border-default mb-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
                ${active === t.id
                  ? 'border-brand text-text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading || !me ? (
          <div className="text-sm text-text-muted py-8 text-center">Loading…</div>
        ) : (
          <>
            {active === 'profile' && <ProfileTab me={me} onSaved={loadMe} />}
            {active === 'channels' && <ChannelsTab me={me} onChanged={loadMe} />}
            {active === 'users' && isAdmin && <UsersTab currentUserId={me.id} />}
            {active === 'admin-channels' && isAdmin && <AdminChannelsTab />}
            {active === 'brand-contexts' && isAdmin && <BrandContextsTab />}
          </>
        )}

        <div className="mt-10 pt-6 border-t border-border-default">
          <Button variant="ghost" size="sm" onClick={() => router.push('/inbox')}>
            ← Done
          </Button>
        </div>
      </main>
    </div>
  );
}
