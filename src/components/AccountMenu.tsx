'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AppUser } from '@/types';

interface AccountMenuProps {
  user: AppUser;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AccountMenu({ user }: AccountMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        title={user.name}
        className={`w-9 h-9 rounded-full flex items-center justify-center text-text-inverse text-[11px] font-semibold transition-all
          ${open ? 'bg-brand ring-2 ring-brand/50' : 'bg-brand/80 hover:bg-brand'}`}
      >
        {getInitials(user.name)}
      </button>

      {open && (
        <div
          className="absolute left-full bottom-0 ml-3 w-56 rounded-lg border border-border-default bg-elevated shadow-lg z-50 overflow-hidden"
          role="menu"
        >
          <div className="px-3 py-3 border-b border-border-subtle">
            <div className="text-sm font-semibold text-text-primary truncate">{user.name}</div>
            <div className="text-[11px] text-text-secondary truncate">{user.email}</div>
            <div className="mt-1.5 inline-block text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-muted text-text-secondary">
              {user.role}
            </div>
          </div>
          {user.role === 'ADMIN' && (
            <button
              onClick={() => {
                setOpen(false);
                router.push('/admin');
              }}
              className="w-full text-left px-3 py-2 text-sm text-text-default hover:bg-canvas transition-colors flex items-center gap-2"
              role="menuitem"
            >
              <span>Admin panel</span>
              <span className="ml-auto text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-brand-soft text-brand">
                Admin
              </span>
            </button>
          )}
          <button
            onClick={() => {
              setOpen(false);
              router.push('/settings');
            }}
            className="w-full text-left px-3 py-2 text-sm text-text-default hover:bg-canvas transition-colors"
            role="menuitem"
          >
            Settings
          </button>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full text-left px-3 py-2 text-sm text-danger hover:bg-canvas disabled:opacity-50 transition-colors border-t border-border-subtle"
            role="menuitem"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
