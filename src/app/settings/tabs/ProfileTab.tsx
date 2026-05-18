'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';

interface Me {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'AGENT';
}

interface ProfileTabProps {
  me: Me;
  onSaved: () => void;
}

export default function ProfileTab({ me, onSaved }: ProfileTabProps) {
  return (
    <div className="space-y-6">
      <NameCard me={me} onSaved={onSaved} />
      <PasswordCard />
      <ReadOnlyCard label="Email" value={me.email} hint="Email is fixed — contact an admin to change it." />
      <ReadOnlyCard label="Role" value={me.role} />
    </div>
  );
}

function NameCard({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const [name, setName] = useState(me.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = name.trim() !== me.name && name.trim().length > 0;

  async function save() {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Could not save'); return; }
      setSaved(true);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Display name">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 px-3 py-2 border border-border-default rounded-md text-sm text-text-default focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
        />
        <Button variant="primary" size="md" onClick={save} disabled={!dirty || busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
      {saved && <p className="mt-2 text-[11px] text-success">Saved.</p>}
    </Card>
  );
}

function PasswordCard() {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = pw.length >= 8 && confirm.length > 0 && pw !== confirm;
  const canSave = pw.length >= 8 && pw === confirm && !busy;

  async function save() {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Could not change password'); return; }
      setSaved(true);
      setPw('');
      setConfirm('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Change password" subtitle="Minimum 8 characters.">
      <div className="space-y-2">
        <input
          type="password"
          placeholder="New password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="w-full px-3 py-2 border border-border-default rounded-md text-sm text-text-default focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
        />
        {tooShort && <p className="text-[11px] text-danger">At least 8 characters.</p>}
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-3 py-2 border border-border-default rounded-md text-sm text-text-default focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-brand/15"
        />
        {mismatch && <p className="text-[11px] text-danger">Passwords don&apos;t match.</p>}
        <div className="pt-1">
          <Button variant="primary" size="md" onClick={save} disabled={!canSave}>
            {busy ? 'Updating…' : 'Update password'}
          </Button>
        </div>
        {error && <p className="text-[11px] text-danger">{error}</p>}
        {saved && <p className="text-[11px] text-success">Password updated.</p>}
      </div>
    </Card>
  );
}

function ReadOnlyCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card title={label}>
      <div className="text-sm text-text-primary">{value}</div>
      {hint && <p className="mt-1 text-[11px] text-text-muted">{hint}</p>}
    </Card>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border-default bg-elevated">
      <div className="px-4 py-3 border-b border-border-subtle">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        {subtitle && <div className="text-[11px] text-text-secondary mt-0.5">{subtitle}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
