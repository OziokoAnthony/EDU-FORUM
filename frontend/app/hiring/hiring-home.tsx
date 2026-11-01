'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  VACANCY_STATUS_LABELS,
  VACANCY_STATUSES,
  type MyVacancyResponse,
  type VacancyStatus,
} from '@edu-forum/shared';
import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { salaryRange } from '@/lib/format';
import { useMyVacancies, useRefreshVacancies } from '@/lib/vacancies';
import { HiringNav } from './hiring-nav';
import { HiringOverview } from './hiring-overview';

const STATUS_STYLE: Record<VacancyStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  published: 'bg-emerald-100 text-emerald-800',
  paused: 'bg-amber-100 text-amber-800',
  closed: 'bg-slate-200 text-slate-600',
};

/** Principals and directors: overview (FR-10), then their vacancies by status with the lifecycle actions. */
export function HiringHome() {
  const [tab, setTab] = useState<VacancyStatus | undefined>(undefined);
  const vacancies = useMyVacancies(tab);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <HiringNav current="vacancies" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="animate-fade-up text-2xl font-bold text-slate-900">Your vacancies</h1>
        <Link href="/hiring/vacancies/new" className="rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-600">
          Post a vacancy
        </Link>
      </div>

      <HiringOverview />

      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Filter by status">
        {[undefined, ...VACANCY_STATUSES].map((s) => (
          <button
            key={s ?? 'all'}
            type="button"
            role="tab"
            aria-selected={tab === s}
            onClick={() => setTab(s)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${tab === s ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            {s ? VACANCY_STATUS_LABELS[s] : 'All'}
          </button>
        ))}
      </div>

      {vacancies.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : vacancies.isError ? (
        <Alert>Could not load your vacancies. Refresh the page to try again.</Alert>
      ) : vacancies.data.data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
          {tab ? 'No vacancies here yet.' : 'You have not posted a vacancy yet.'}
        </p>
      ) : (
        <ul className="stagger space-y-3">
          {vacancies.data.data.map((v) => (
            <VacancyCard key={v.id} v={v} />
          ))}
        </ul>
      )}
    </main>
  );
}

function VacancyCard({ v }: { v: MyVacancyResponse }) {
  const { authed } = useAuth();
  const refresh = useRefreshVacancies();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(path: string, method: 'POST' | 'DELETE' = 'POST', body?: unknown) {
    setError(null);
    setBusy(true);
    try {
      await authed(`/vacancies/${v.id}${path}`, { method, body });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const action = (label: string, run: () => void, danger = false) => (
    <button type="button" disabled={busy} onClick={run} className={`font-semibold underline disabled:opacity-60 ${danger ? 'text-red-700' : 'text-emerald-800'}`}>
      {label}
    </button>
  );

  return (
    <li className="lift rounded-lg border border-slate-200 bg-panel shadow-sm p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{v.title}</p>
          <p className="text-sm text-slate-600">
            {v.schoolLabel}
            {v.isAnonymous ? ' (anonymous)' : ''} · {v.location.lga.name}, {v.location.state.name}
          </p>
          <p className="text-sm text-slate-600">
            {salaryRange(v.salaryMin, v.salaryMax, v.salaryPeriod)}
          </p>
          <p className="text-sm text-slate-500">
            {v.applicantsCount} applicant{v.applicantsCount === 1 ? '' : 's'}
            {v.deadline && v.status === 'published' ? ` · closes ${v.deadline}` : ''}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[v.status]}`}>{VACANCY_STATUS_LABELS[v.status]}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        {v.status !== 'closed' ? <Link href={`/hiring/vacancies/${v.id}/edit`} className="font-semibold text-emerald-800 underline">Edit</Link> : null}
        {v.status === 'draft' || v.status === 'paused' ? action(v.status === 'paused' ? 'Resume' : 'Publish', () => act('/publish')) : null}
        {v.status === 'published' ? action('Pause', () => act('/pause')) : null}
        {v.status === 'published' || v.status === 'paused' ? action('Close', () => act('/close', 'POST', { reason: 'filled' })) : null}
        {v.status !== 'draft' ? (
          <Link href={`/hiring/vacancies/${v.id}/applicants`} className="font-semibold text-emerald-800 underline">
            Applicants ({v.applicantsCount})
          </Link>
        ) : null}
        {v.status === 'published' ? (
          <Link href={`/hiring/vacancies/${v.id}/recommended`} className="font-semibold text-emerald-800 underline">
            Recommended teachers
          </Link>
        ) : null}
        {v.status === 'published' ? (
          <Link href={`/hiring/community?share=${v.id}`} className="font-semibold text-emerald-800 underline">
            Share in community
          </Link>
        ) : null}
        {action('Duplicate', () => act('/duplicate'))}
        {v.status === 'draft' ? action('Delete', () => act('', 'DELETE'), true) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </li>
  );
}
