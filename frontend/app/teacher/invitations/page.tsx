'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { INVITATION_STATUS_LABELS, type Paginated, type ReceivedInvitation } from '@edu-forum/shared';
import { SecondaryButton } from '@/components/form';
import { ScreeningForm } from '@/components/screening-form';
import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { salaryRange, shortDate } from '@/lib/format';
import { MY_APPLICATIONS_KEY } from '../jobs/[id]/apply-panel';

const KEY = ['invitations', 'mine'];

/** Invitations to apply. Accepting applies (screening questions included); declining tells the poster. */
export default function Page() {
  const { authed } = useAuth();
  const list = useQuery({ queryKey: KEY, queryFn: () => authed<Paginated<ReceivedInvitation>>('/invitations/me?limit=50'), staleTime: 0 });

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <Link href="/teacher" className="text-sm text-emerald-800 underline">
        ← Back to dashboard
      </Link>
      <h1 className="text-3xl text-slate-900">Invitations</h1>
      <p className="text-sm text-slate-600">Principals and directors who liked your profile invite you to apply. Accepting sends your profile and current CV.</p>
      {list.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : list.isError ? (
        <Alert>{list.error.message}</Alert>
      ) : list.data.data.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-slate-600">No invitations yet. A complete profile gets noticed more.</p>
      ) : (
        <ul className="stagger space-y-3">
          {list.data.data.map((i) => (
            <InvitationCard key={i.id} i={i} />
          ))}
        </ul>
      )}
    </main>
  );
}

function InvitationCard({ i }: { i: ReceivedInvitation }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: KEY }), qc.invalidateQueries({ queryKey: MY_APPLICATIONS_KEY })]);

  async function decline() {
    if (!window.confirm('Decline this invitation? The school will be told.')) return;
    setError(null);
    try {
      await authed(`/invitations/${i.id}/decline`, { method: 'POST', body: {} });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not decline. Try again.');
    }
  }

  const v = i.vacancy;
  return (
    <li className="lift space-y-3 rounded-md border border-slate-200 bg-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/teacher/jobs/${v.id}`} className="font-semibold text-emerald-800 underline">
            {v.title}
          </Link>
          <p className="text-sm text-slate-600">
            {v.schoolLabel} · {v.lga}, {v.state}
          </p>
          <p className="text-sm text-slate-700">{salaryRange(v.salaryMin, v.salaryMax, v.salaryPeriod)}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{INVITATION_STATUS_LABELS[i.status]}</span>
      </div>
      {i.message ? <p className="text-slate-700">“{i.message}”</p> : null}
      <p className="text-xs text-slate-500">
        Invited {shortDate(i.invitedAt)}
        {i.status === 'pending' && i.expiresAt ? ` · reply by ${shortDate(i.expiresAt)}` : ''}
      </p>
      {error ? <Alert>{error}</Alert> : null}
      {i.status === 'accepted' ? (
        <Link href="/teacher/applications" className="text-sm font-semibold text-emerald-800 underline">
          See my application
        </Link>
      ) : null}
      {i.status === 'pending' && !accepting ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAccepting(true)} className="rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-600">
            Accept and apply
          </button>
          <SecondaryButton onClick={() => void decline()}>Decline</SecondaryButton>
        </div>
      ) : null}
      {i.status === 'pending' && accepting ? (
        <div className="animate-fade-up rounded-md border border-emerald-200 p-4">
          <ScreeningForm
            questions={v.screeningQuestions}
            submitLabel="Accept and send application"
            onSubmit={async (body) => {
              await authed(`/invitations/${i.id}/accept`, { method: 'POST', body });
              await refresh();
            }}
          >
            <p className="text-sm text-slate-600">Answer the school&apos;s questions to apply. Your profile and current CV are sent.</p>
          </ScreeningForm>
        </div>
      ) : null}
    </li>
  );
}
