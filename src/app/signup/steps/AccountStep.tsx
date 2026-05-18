'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';

interface AccountStepProps {
  initial: { name: string; email: string };
  onSubmitted: (user: { name: string; email: string }) => void;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function AccountStep({ initial, onSubmitted }: AccountStepProps) {
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState({ name: false, email: false, password: false, confirm: false });
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const errors: Record<string, string | null> = {
    name: !name.trim() ? 'Name is required' : null,
    email: !email ? 'Email is required' : !validateEmail(email) ? 'Enter a valid email address' : null,
    password: !password ? 'Password is required' : password.length < 8 ? 'Use at least 8 characters' : null,
    confirm: !confirm ? 'Please re-enter your password' : confirm !== password ? 'Passwords do not match' : null,
  };
  const valid = !errors.name && !errors.email && !errors.password && !errors.confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true, confirm: true });
    if (!valid) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data?.error ?? 'Could not create account');
        return;
      }
      onSubmitted({ name: data.name, email: data.email });
    } catch {
      setServerError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Create your account</h2>
        <p className="text-sm text-text-secondary mt-1">A few details to get you in.</p>
      </div>

      <Field
        label="Full name"
        placeholder="Priya Sharma"
        value={name}
        onChange={setName}
        onBlur={() => setTouched((t) => ({ ...t, name: true }))}
        error={touched.name ? errors.name : null}
        autoComplete="name"
      />

      <Field
        label="Work email"
        type="email"
        placeholder="you@acceltancy.in"
        value={email}
        onChange={setEmail}
        onBlur={() => setTouched((t) => ({ ...t, email: true }))}
        error={touched.email ? errors.email : null}
        autoComplete="email"
      />

      <Field
        label="Password"
        type="password"
        placeholder="At least 8 characters"
        value={password}
        onChange={setPassword}
        onBlur={() => setTouched((t) => ({ ...t, password: true }))}
        error={touched.password ? errors.password : null}
        autoComplete="new-password"
      />

      <Field
        label="Confirm password"
        type="password"
        placeholder="Re-enter password"
        value={confirm}
        onChange={setConfirm}
        onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
        error={touched.confirm ? errors.confirm : null}
        autoComplete="new-password"
      />

      {serverError && (
        <div className="bg-danger-soft border border-danger/20 text-danger text-sm px-3 py-2 rounded-md">
          {serverError}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <a href="/login" className="text-xs text-text-secondary hover:text-text-primary">
          Already have an account? Sign in
        </a>
        <Button type="submit" variant="primary" size="md" disabled={submitting || !valid}>
          {submitting ? 'Creating account…' : 'Continue'}
        </Button>
      </div>
    </form>
  );
}

interface FieldProps {
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  error: string | null;
  autoComplete?: string;
}

function Field({ label, type = 'text', placeholder, value, onChange, onBlur, error, autoComplete }: FieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-default mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`w-full px-3 py-2 border rounded-md text-sm text-text-default placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/15
          ${error ? 'border-danger focus:border-danger' : 'border-border-default focus:border-border-strong'}`}
      />
      {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
    </div>
  );
}
