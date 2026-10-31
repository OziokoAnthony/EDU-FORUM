'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { INVITATION_STATUS_LABELS, type Paginated, type SentInvitation } from '@edu-forum/shared';
import { SENT_INVITATIONS_KEY } from '@/components/invite-panel';
import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { shortDate } from '@/lib/format';
import { HiringNav } from '../hiring-nav';

/** Invitations this principal/director has sent, with their replies. */
export default function Page() {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const sent = useQuery({ queryKey: SENT_INVITATIONS_KEY, queryFn: () => authed<Paginated<SentInvitation>>('/invitations/sent?limit=50'), staleTime: 0 });

  async function cancel(id: string) {
    if (!window.confirm('Cancel this invitation?')) return;
    setError(null);
    try {
      await authed(`/invitations/${id}`, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: SENT_INVITATIONS_KEY });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel. Try again.');
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <HiringNav current="invitations" />
      <h1 className="text-3xl text-slate-900">Invitations sent</h1>
      <p className="text-sm text-slate-600">Invite a teacher from their profile in Find teachers. Accepting sends you their application.</p>
      {error ? <Alert>{error}</Alert> : null}
      {sent.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : sent.isError ? (
        <Alert>{sent.error.message}</Alert>
      ) : sent.data.data.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-slate-600">
          No invitations yet.{' '}
          <Link href="/hiring/teachers" className="font-semibold text-emerald-800 underline">
            Find teachers
          </Link>
        </p>
      ) : (
        <ul className="stagger space-y-3">
          {sent.data.data.map((i) => (
            <li key={i.id} className="lift space-y-2 rounded-md border border-slate-200 bg-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link href={`/hiring/teachers/${i.teacher.id}`} className="font-semibold text-emerald-800 underline">
                    {i.teacher.fullName ?? 'Teacher'}
                  </Link>
                  <p className="text-sm text-slate-600">
                    {i.vacancy.title} · sent {shortDate(i.invitedAt)}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{INVITATION_STATUS_LABELS[i.status]}</span>
              </div>
              {i.message ? <p className="text-sm text-slate-600">“{i.message}”</p> : null}
              <div className="flex flex-wrap gap-4 text-sm font-semibold">
                {i.applicationId ? (
                  <Link href={`/hiring/applications/${i.applicationId}`} className="text-emerald-800 underline">
                    See application
                  </Link>
                ) : null}
                {i.status === 'pending' ? (
                  <button type="button" onClick={() => void cancel(i.id)} className="text-slate-700 underline">
                    Cancel invitation
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
