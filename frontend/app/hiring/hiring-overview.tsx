'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUSES, type HiringDashboard } from '@edu-forum/shared';
import { TeacherCard } from '@/components/teacher-card';
import { useAuth } from '@/lib/auth';

/** FR-10 for principals and directors: open vacancies with new applicants, pipeline, recommended teachers. */
export function HiringOverview() {
  const { authed } = useAuth();
  const d = useQuery({ queryKey: ['hiring-dashboard'], queryFn: () => authed<HiringDashboard>('/hiring/dashboard'), staleTime: 30_000 });
  if (d.isPending || d.isError) return null;
  const { vacancies, open, pipeline, invitations, interviews, recommended } = d.data;
  if (vacancies.live + vacancies.paused + vacancies.drafts === 0) return null;
  const inPipeline = APPLICATION_STATUSES.filter((s) => pipeline[s] > 0);

  return (
    <section aria-labelledby="overview" className="space-y-4">
      <h2 id="overview" className="sr-only">
        Overview
      </h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Live vacancies', value: vacancies.live, href: '/hiring' },
          { label: 'New applicants', value: open.reduce((n, v) => n + v.unviewed, 0), href: null },
          { label: 'Invitations waiting', value: invitations.pending, href: '/hiring/invitations' },
          { label: 'Upcoming interviews', value: interviews.upcoming, href: '/hiring/interviews' },
        ].map((s) => {
          const body = (
            <>
              <dd className="text-2xl font-bold text-slate-900">{s.value}</dd>
              <dt className="text-sm text-slate-600">{s.label}</dt>
            </>
          );
          return s.href ? (
            <Link key={s.label} href={s.href} className="lift rounded-lg border border-slate-200 bg-panel p-3">
              {body}
            </Link>
          ) : (
            <div key={s.label} className="rounded-lg border border-slate-200 bg-panel p-3">
              {body}
            </div>
          );
        })}
      </dl>

      {open.some((v) => v.unviewed > 0) ? (
        <ul aria-label="New applicants" className="space-y-2">
          {open
            .filter((v) => v.unviewed > 0)
            .map((v) => (
              <li key={v.id}>
                <Link href={`/hiring/vacancies/${v.id}/applicants`} className="flex items-center justify-between gap-3 rounded-lg border border-gold/50 bg-gold/10 px-4 py-3">
                  <span className="font-semibold text-slate-900">{v.title}</span>
                  <span className="shrink-0 text-sm font-semibold text-emerald-800">
                    {v.unviewed} new of {v.applicants}
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      ) : null}

      {inPipeline.length ? (
        <div>
          <h3 className="mb-2 font-semibold text-slate-900">Applicants by stage</h3>
          <ul className="flex flex-wrap gap-2">
            {inPipeline.map((s) => (
              <li key={s} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                {APPLICATION_STATUS_LABELS[s]}: <span className="font-semibold">{pipeline[s]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {recommended && recommended.teachers.length ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold text-slate-900">Recommended for “{recommended.vacancyTitle}”</h3>
            <Link href={`/hiring/vacancies/${recommended.vacancyId}/recommended`} className="text-sm font-semibold text-emerald-800 underline">
              See all
            </Link>
          </div>
          <ul className="space-y-3">
            {recommended.teachers.map((t) => (
              <TeacherCard key={t.id} t={t} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
