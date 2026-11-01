'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { SIGNUP_ROLES, type AuthTokensResponse, type SignupRole } from '@edu-forum/shared';
import { rememberDeletionCancelled } from '@/components/account-settings';
import { Alert, Button } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const CLIENT_ID = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '').trim();
const ROLE_LABELS: Record<SignupRole, string> = { teacher: 'Teacher', principal: 'Principal', director: 'Director' };

interface GoogleId {
  initialize(options: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup'; context?: string; use_fedcm_for_prompt?: boolean }): void;
  renderButton(el: HTMLElement, options: Record<string, unknown>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google sign-in could not load'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * "Continue with Google" (user, 2026-11-01). Hidden until NEXT_PUBLIC_GOOGLE_CLIENT_ID is set.
 * A first-time Google user picks teacher/principal/director and accepts the terms here, once.
 */
export function GoogleSignIn({ mode }: { mode: 'signin' | 'signup' }) {
  const { setSession } = useAuth();
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ credential: string; email: string } | null>(null);
  const [role, setRole] = useState<SignupRole | ''>('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(credential: string, extra: { role?: SignupRole; consent?: true } = {}) {
    setBusy(true);
    setError(null);
    try {
      const res = await api<AuthTokensResponse>('/auth/google', { method: 'POST', body: { credential, ...extra } });
      if (res.deletionCancelled) rememberDeletionCancelled();
      setSession(res);
    } catch (err) {
      const details = err instanceof ApiError ? (err.body.details as { signupRequired?: boolean; email?: string } | undefined) : undefined;
      if (details?.signupRequired) setPending({ credential, email: details.email ?? '' });
      else setError(err instanceof ApiError ? err.message : 'Google sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.google) return;
        window.google.accounts.id.initialize({ client_id: CLIENT_ID, ux_mode: 'popup', context: mode === 'signup' ? 'signup' : 'signin', callback: (r) => void sendRef.current(r.credential) });
        window.google.accounts.id.renderButton(box.current, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: mode === 'signup' ? 'signup_with' : 'continue_with', logo_alignment: 'left', width: Math.min(box.current.clientWidth || 320, 400) });
      })
      .catch(() => setError('Google sign-in could not load. Check your connection or use your email instead.'));
    return () => {
      cancelled = true;
    };
  }, [mode]);

  if (!CLIENT_ID) return null;

  if (pending) {
    return (
      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="font-semibold text-slate-900">Almost done{pending.email ? `, ${pending.email}` : ''}</p>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-800">I am a…</legend>
          <div className="flex flex-wrap gap-2">
            {SIGNUP_ROLES.map((r) => (
              <label key={r} className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold ${role === r ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
                <input type="radio" name="google-role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
                {ROLE_LABELS[r]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>
            I agree to the <Link href="/terms" className="underline">terms</Link> and <Link href="/privacy" className="underline">privacy policy</Link>.
          </span>
        </label>
        {error ? <Alert>{error}</Alert> : null}
        <Button type="button" loading={busy} disabled={!role || !consent} onClick={() => role && void send(pending.credential, { role, consent: true })}>
          Create my account
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div ref={box} className="flex min-h-[44px] justify-center" aria-label="Continue with Google" />
      {error ? <Alert>{error}</Alert> : null}
      <div className="flex items-center gap-3 text-xs uppercase text-slate-400">
        <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
      </div>
    </div>
  );
}
