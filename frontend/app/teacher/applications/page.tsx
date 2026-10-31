'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { APPLICATION_STATUS_LABELS, canMove, type MyApplicationResponse, type Paginated } from '@edu-forum/shared';
import { StatusBadge } from '@/components/status-badge';
import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { salaryRange, shortDate } from '@/lib/format';
import { MY_APPLICATIONS_KEY } from '../jobs/[id]/apply-panel';

/** The teacher's applications with status, history and withdraw. */
export default function Page() {
  const { authed } = useAuth();
  const apps = useQuery({
    queryKey: MY_APPLICATIONS_KEY,
    queryFn: () => authed<Paginated<MyApplicationResponse>>('/applications/me?limit=50'),
    staleTime: 0,
  });

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <Link href="/teacher" className="text-sm text-emerald-800 underline">
        ← Back to dashboard
      </Link>
      <h1 className="text-2xl font-bold text-slate-900">My applications</h1>
      {apps.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : apps.isError ? (
        <Alert>{apps.error.message}</Alert>
      ) : apps.data.data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
          You have not applied for any job yet.{' '}
          <Link href="/teacher/jobs" className="font-semibold text-emerald-800 underline">
            Find teaching jobs
          </Link>
        </p>
      ) : (
        <ul className="space-y-3">
          {apps.data.data.map((a) => (
            <ApplicationCard key={a.id} a={a} />
          ))}
        </ul>
      )}
    </main>
  );
}

function ApplicationCard({ a }: { a: MyApplicationResponse }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    if (!window.confirm('Withdraw this application? You cannot apply again for this job.')) return;
    setError(null);
    try {
      await authed(`/applications/${a.id}/withdraw`, { method: 'POST' });
      await qc.invalidateQueries({ queryKey: MY_APPLICATIONS_KEY });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not withdraw. Try again.');
    }
  }

  return (
    <li className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/teacher/jobs/${a.vacancy.id}`} className="font-semibold text-emerald-900 underline">
            {a.vacancy.title}
          </Link>
          <p className="text-sm text-slate-700">
            {a.vacancy.schoolLabel} · {a.vacancy.lga.name}, {a.vacancy.state.name}
          </p>
          <p className="text-sm text-slate-600">{salaryRange(a.vacancy.salaryMin, a.vacancy.salaryMax, a.vacancy.salaryPeriod)}</p>
          <p className="text-sm text-slate-500">
            Applied {shortDate(a.appliedAt)} with {a.cvFileName}
            {a.vacancy.status === 'closed' ? ' · job closed' : ''}
          </p>
        </div>
        <StatusBadge status={a.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-emerald-800 underline">
          {open ? 'Hide history' : 'Show history'}
        </button>
        {canMove(a.status, 'withdrawn') ? (
          <button type="button" onClick={() => void withdraw()} className="text-red-700 underline">
            Withdraw
          </button>
        ) : null}
      </div>
      {open ? (
        <ol className="mt-3 space-y-2 border-l-2 border-slate-200 pl-4">
          {a.history.map((h) => (
            <li key={h.id} className="text-sm">
              <span className="font-semibold text-slate-800">{APPLICATION_STATUS_LABELS[h.toStatus]}</span>{' '}
              <span className="text-slate-500">
                {shortDate(h.at)} · {h.by}
              </span>
              {h.message ? <p className="text-slate-700">“{h.message}”</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </li>
  );
}
