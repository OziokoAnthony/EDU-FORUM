'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Alert, AuthCard, Button } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';

export function VerifyEmail({ token }: { token: string | null }) {
  const { user, status, reloadUser } = useAuth();
  const [state, setState] = useState<'idle' | 'verifying' | 'verified' | 'failed'>(token ? 'verifying' : 'idle');
  const [message, setMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api('/auth/verify-email', { method: 'POST', body: { token } })
      .then(async () => {
        setState('verified');
        await reloadUser();
      })
      .catch((err) => {
        setState('failed');
        setMessage(err instanceof ApiError ? err.body.message : 'Could not verify your email.');
      });
  }, [token, reloadUser]);

  async function resend() {
    if (!user?.email) return;
    setResending(true);
    await api('/auth/resend-verification', { method: 'POST', body: { identifier: user.email } }).catch(() => undefined);
    setResending(false);
    setMessage(`We sent a new link to ${user.email}.`);
  }

  if (state === 'verifying') return <AuthCard title="Verifying your email…">{null}</AuthCard>;

  if (state === 'verified') {
    return (
      <AuthCard title="Email verified">
        <Alert kind="success">Thanks, your email address is confirmed.</Alert>
        <Link
          href={user ? homeFor(user) : '/login'}
          className="block rounded-lg bg-emerald-700 px-4 py-3 text-center font-semibold text-white"
        >
          {user ? 'Continue' : 'Sign in'}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Check your email">
      {state === 'failed' && message ? <Alert>{message}</Alert> : null}
      <p className="text-slate-700">
        {user?.email ? (
          <>
            We sent a confirmation link to <strong>{user.email}</strong>. Open it to continue.
          </>
        ) : (
          'Open the confirmation link we emailed you to continue.'
        )}
      </p>
      {state !== 'failed' && message ? <Alert kind="success">{message}</Alert> : null}
      {status === 'signed-in' && user?.email && !user.emailVerified ? (
        <Button type="button" onClick={resend} loading={resending}>
          Send a new link
        </Button>
      ) : status === 'signed-out' ? (
        <Link href="/login" className="block text-center font-semibold text-emerald-800 underline">
          Sign in to get a new link
        </Link>
      ) : null}
    </AuthCard>
  );
}
