'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { Paginated, SavedEntry } from '@edu-forum/shared';
import { SAVED_KEY, SaveButton, SavedSearches } from '@/components/saved';
import { Alert } from '@/components/ui';
import { VacancyCard } from '@/components/vacancy-card';
import { useAuth } from '@/lib/auth';

/** Saved jobs (closed ones stay, marked closed) and job alerts. */
export default function Page() {
  const { authed } = useAuth();
  const saved = useQuery({ queryKey: [...SAVED_KEY, 'list'], queryFn: () => authed<Paginated<SavedEntry>>('/saved?limit=50'), staleTime: 0 });

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-6">
      <Link href="/teacher" className="text-sm text-emerald-800 underline">
        ← Back to dashboard
      </Link>
      <section className="space-y-3">
        <h1 className="text-3xl text-slate-900">Saved jobs</h1>
        {saved.isPending ? (
          <p className="text-slate-500">Loading…</p>
        ) : saved.isError ? (
          <Alert>{saved.error.message}</Alert>
        ) : saved.data.data.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-slate-600">No saved jobs yet. Tap ☆ Save on a job to keep it here.</p>
        ) : (
          <ul className="stagger space-y-4">
            {saved.data.data.map((e) =>
              e.itemType === 'vacancy' ? (
                <li key={e.id} className="space-y-2">
                  {e.vacancy ? (
                    <>
                      {e.vacancy.closed ? <p className="text-sm font-semibold text-amber-800">Closed: this job is no longer taking applications.</p> : null}
                      <ul>
                        <VacancyCard v={e.vacancy} href={`/teacher/jobs/${e.itemId}`} />
                      </ul>
                    </>
                  ) : (
                    <p className="rounded-md border border-slate-200 p-4 text-slate-600">This job was removed.</p>
                  )}
                  <SaveButton itemType="vacancy" itemId={e.itemId} />
                </li>
              ) : null,
            )}
          </ul>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl text-slate-900">Job alerts</h2>
        <SavedSearches resultsPath="/teacher/jobs" />
      </section>
    </main>
  );
}
