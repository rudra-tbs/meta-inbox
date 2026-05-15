'use client';

import { useState, useEffect, useRef } from 'react';
import type { Conversation, AppUser } from '@/types';

interface AssignDropdownProps {
  conversation: Conversation;
  onAssign: (updated: Conversation) => void;
}

export default function AssignDropdown({ conversation, onAssign }: AssignDropdownProps) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function loadUsers() {
    if (users.length > 0) return;
    const res = await fetch('/api/users');
    if (res.ok) {
      const data = await res.json();
      setUsers(data);
    }
  }

  async function handleAssign(userId: string | null) {
    setLoading(true);
    setOpen(false);

    try {
      const res = await fetch(`/api/conversations/${conversation.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (res.ok) {
        const updated = await res.json();
        onAssign(updated);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          loadUsers();
          setOpen((o) => !o);
        }}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
      >
        <svg
          className="w-3 h-3 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
        {conversation.assigned_user_name || 'Unassigned'}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg min-w-[160px] z-50">
          <button
            onClick={() => handleAssign(null)}
            className="w-full text-left px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 border-b border-slate-100"
          >
            Unassign
          </button>
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => handleAssign(u.id)}
              className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
            >
              {u.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
