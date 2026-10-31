'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MEMBER_ROLE_LABELS, type InvitePreviewResponse } from '@edu-forum/shared';
import { Alert, AuthCard, Button } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function JoinSchool({ token }: { token: string | null }) {
  const router = useRouter();
  const { status, user, authed, reloadUser, logout } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<InvitePreviewResponse>(`/schools/invites/${token}`),
    enabled: !!token,
    retry: false,
  });

  if (!token || invite.isError) {
    return (
      <AuthCard title="Invite not valid">
        <Alert>
          {invite.error instanceof ApiError ? invite.error.message : 'This invite link is invalid or has expired. Ask the school to send a new one.'}
        </Alert>
      </AuthCard>
    );
  }
  if (invite.isPending || status === 'loading') return <p className="px-4 py-10 text-center text-slate-500">Loading…</p>;

  const i = invite.data;
  const here = `/join-school?token=${encodeURIComponent(token)}`;
  const role = MEMBER_ROLE_LABELS[i.role].toLowerCase();

  async function accept() {
    setError(null);
    setJoining(true);
    try {
      await authed(`/schools/invites/${token}/accept`, { method: 'POST' });
      await reloadUser();
      router.replace('/school');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join. Try again.');
      setJoining(false);
    }
  }

  return (
    <AuthCard title={`Join ${i.schoolName}`}>
      <p className="text-slate-700">
        You have been invited to recruit teachers for <strong>{i.schoolName}</strong> as {role === 'owner' ? 'an owner' : 'a recruiter'}.
        The invite was sent to <strong className="break-all">{i.email}</strong>.
      </p>

      {status === 'signed-in' && user ? (
        user.email === i.email ? (
          <>
            {error ? <Alert>{error}</Alert> : null}
            <Button type="button" loading={joining} onClick={accept}>
              Join {i.schoolName}
            </Button>
          </>
        ) : (
          <>
            <Alert>
              You are signed in as {user.email ?? user.phone}. Sign out, then sign in or create an account with {i.email}.
            </Alert>
            <Button type="button" onClick={() => void logout()}>
              Sign out
            </Button>
          </>
        )
      ) : i.hasAccount ? (
        <Link
          href={`/login?next=${encodeURIComponent(here)}`}
          className="flex w-full items-center justify-center rounded-lg bg-emerald-700 px-4 py-3 text-base font-semibold text-white"
        >
          Sign in to accept
        </Link>
      ) : (
        <Link
          href={`/register?role=school&email=${encodeURIComponent(i.email)}&next=${encodeURIComponent(here)}`}
          className="flex w-full items-center justify-center rounded-lg bg-emerald-700 px-4 py-3 text-base font-semibold text-white"
        >
          Create your account to accept
        </Link>
      )}
    </AuthCard>
  );
}
