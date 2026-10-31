'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { Paginated, TeacherListItem } from '@edu-forum/shared';
import { TeacherCard } from '@/components/teacher-card';
import { Alert } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useMyVacancy } from '@/lib/vacancies';

/** Teachers who best match one of the poster's vacancies (same state or willing to relocate). */
export function Recommended({ id }: { id: string }) {
  const { authed } = useAuth();
  const vacancy = useMyVacancy(id);
  const teachers = useQuery({
    queryKey: ['vacancies', id, 'recommended-teachers'],
    queryFn: () => authed<Paginated<TeacherListItem>>(`/vacancies/${id}/recommended-teachers`),
  });
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <Link href="/hiring" className="text-sm text-emerald-800 underline">
        ← Back to vacancies
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Recommended teachers</h1>
        {vacancy.data ? <p className="text-slate-600">For {vacancy.data.title}</p> : null}
      </div>
      {teachers.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : teachers.isError ? (
        <Alert>{teachers.error.message}</Alert>
      ) : teachers.data.data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
          No matching teachers yet. Try the teacher search with wider filters.
        </p>
      ) : (
        <ul className="space-y-3">
          {teachers.data.data.map((t) => (
            <TeacherCard key={t.id} t={t} />
          ))}
        </ul>
      )}
    </main>
  );
}
