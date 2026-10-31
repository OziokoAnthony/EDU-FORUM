'use client';

import { Suspense } from 'react';
import { VACANCY_STATUS_LABELS, type AdminVacancyItem } from '@edu-forum/shared';
import { useAuth } from '@/lib/auth';
import { shortDate } from '@/lib/format';
import { AdminList } from '../admin-list';
import { AdminNav, askReason } from '../admin-nav';

export default function Page() {
  const { authed } = useAuth();
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <AdminNav current="vacancies" />
      <h1 className="text-2xl font-bold text-slate-900">Vacancies</h1>
      <Suspense>
        <AdminList<AdminVacancyItem>
          path="/admin/vacancies"
          searchLabel="Title or school name"
          filters={[
            { key: 'status', options: Object.entries(VACANCY_STATUS_LABELS).map(([value, label]) => ({ value, label })) },
            { key: 'takenDown', options: [{ value: 'true', label: 'Taken down' }] },
          ]}
          render={(v, act) => (
            <li key={v.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 p-4">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{v.title}</p>
                <p className="text-sm text-slate-600">
                  {v.schoolName ?? 'No school name'}
                  {v.isAnonymous ? ' (anonymous)' : ''} · {v.lga}, {v.state}
                </p>
                <p className="break-all text-sm text-slate-500">
                  {VACANCY_STATUS_LABELS[v.status]} · {v.applicants} applicants · posted by {v.poster.email ?? v.poster.role} ({v.poster.role}) ·{' '}
                  {shortDate(v.publishedAt ?? v.createdAt)}
                </p>
                {v.takedownReason ? <p className="text-sm font-semibold text-red-700">Taken down: {v.takedownReason}</p> : null}
              </div>
              {v.takedownReason ? null : (
                <button
                  type="button"
                  className="text-sm font-semibold text-red-700 underline"
                  onClick={() => {
                    const reason = askReason('take down this vacancy');
                    if (reason) act(() => authed(`/admin/vacancies/${v.id}/takedown`, { method: 'POST', body: { reason } }), 'Vacancy taken down.');
                  }}
                >
                  Take down
                </button>
              )}
            </li>
          )}
        />
      </Suspense>
    </main>
  );
}
