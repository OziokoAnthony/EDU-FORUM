'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import type { MyApplicationResponse, Paginated, VacancyResponse } from '@edu-forum/shared';
import { ScreeningForm } from '@/components/screening-form';
import { StatusBadge } from '@/components/status-badge';
import { Alert } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useMyProfile } from '@/lib/teacher';

export const MY_APPLICATIONS_KEY = ['applications', 'mine'];

/** Apply with the current CV, a cover note and the screening answers (FR-7.1). */
export function ApplyPanel({ v }: { v: VacancyResponse }) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const profile = useMyProfile();
  const mine = useQuery({
    queryKey: MY_APPLICATIONS_KEY,
    queryFn: () => authed<Paginated<MyApplicationResponse>>('/applications/me?limit=50'),
  });

  const existing = mine.data?.data.find((a) => a.vacancy.id === v.id);
  if (existing) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4">
        <p className="text-slate-700">
          You applied on {new Date(existing.appliedAt).toLocaleDateString('en-NG')}. Status: <StatusBadge status={existing.status} />
        </p>
        <Link href="/teacher/applications" className="font-semibold text-emerald-800 underline">
          My applications
        </Link>
      </section>
    );
  }
  if (v.status !== 'published') return null;
  if (profile.data && !profile.data.isPublished) {
    return (
      <Alert kind="info">
        Publish your profile to apply.{' '}
        <Link href="/teacher" className="font-semibold underline">
          Finish your profile
        </Link>
      </Alert>
    );
  }

  return (
    <section className="space-y-5 rounded-lg border border-emerald-200 p-4">
      <h2 className="text-lg font-semibold text-slate-900">Apply for this job</h2>
      <ScreeningForm
        questions={v.screeningQuestions}
        submitLabel="Send application"
        onSubmit={async (body) => {
          await authed(`/vacancies/${v.id}/applications`, { method: 'POST', body });
          await qc.invalidateQueries({ queryKey: MY_APPLICATIONS_KEY });
        }}
      >
        <p className="text-sm text-slate-600">
          Your profile and current CV{profile.data?.cv ? ` (${profile.data.cv.fileName})` : ''} are sent. Updating your CV later does not change this application.
        </p>
      </ScreeningForm>
    </section>
  );
}
