'use client';

import Link from 'next/link';
import { Alert } from '@/components/ui';
import { useMyVacancy } from '@/lib/vacancies';
import { VacancyForm } from '../../vacancy-form';

export function EditVacancy({ id }: { id: string }) {
  const vacancy = useMyVacancy(id);
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/hiring" className="text-sm text-emerald-800 underline">
        ← Back to vacancies
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Edit vacancy</h1>
      <div className="mt-6">
        {vacancy.isPending ? (
          <p className="text-slate-500">Loading…</p>
        ) : vacancy.isError ? (
          <Alert>This vacancy could not be found.</Alert>
        ) : vacancy.data.status === 'closed' ? (
          <Alert kind="info">Closed vacancies cannot be edited. Use &quot;Duplicate&quot; to post it again.</Alert>
        ) : (
          <VacancyForm vacancy={vacancy.data} />
        )}
      </div>
    </main>
  );
}
