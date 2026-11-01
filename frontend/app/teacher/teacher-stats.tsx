'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUSES, type TeacherDashboard } from '@edu-forum/shared';
import { VacancyCard } from '@/components/vacancy-card';
import { useAuth } from '@/lib/auth';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** FR-10 teacher dashboard: views this week, applications by status, invites, interviews, saved, recommended. */
export function TeacherStats() {
  const { authed } = useAuth();
  const d = useQuery({ queryKey: ['teacher-dashboard'], queryFn: () => authed<TeacherDashboard>('/teachers/me/dashboard'), staleTime: 30_000 });
  if (d.isPending || d.isError) return null;
  const { views, applications, invitations, interviews, savedJobs, recommended } = d.data;
  const statuses = APPLICATION_STATUSES.filter((s) => applications.byStatus[s] > 0);

  return (
    <section aria-labelledby="activity" className="space-y-4">
      <h2 id="activity" className="text-lg font-semibold text-slate-900">
        Your activity
      </h2>
      <Link href="/teacher/views" className="lift block rounded-lg border border-gold/50 bg-gold/10 p-4">
        <p className="text-2xl font-bold text-emerald-800">{views.cvViewers}</p>
        <p className="font-semibold text-slate-900">
          {views.cvViewers === 1 ? 'principal or director' : 'principals and directors'} viewed your CV this week
        </p>
        <p className="text-sm text-slate-600">
          {plural(views.viewers, 'visitor')} to your profile in the last {views.days} days · See who
        </p>
      </Link>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Applications', value: applications.total, href: '/teacher/applications' },
          { label: 'Invitations waiting', value: invitations.pending, href: '/teacher/invitations' },
          { label: 'Upcoming interviews', value: interviews.upcoming, href: '/teacher/interviews' },
          { label: 'Saved jobs', value: savedJobs, href: '/teacher/saved' },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="lift rounded-lg border border-slate-200 bg-panel shadow-sm p-3">
            <dd className="text-2xl font-bold text-slate-900">{s.value}</dd>
            <dt className="text-sm text-slate-600">{s.label}</dt>
          </Link>
        ))}
      </dl>

      {statuses.length ? (
        <ul aria-label="Applications by status" className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <li key={s} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              {APPLICATION_STATUS_LABELS[s]}: <span className="font-semibold">{applications.byStatus[s]}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {recommended.length ? (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-semibold text-slate-900">Recommended for you</h3>
            <Link href="/teacher/jobs" className="text-sm font-semibold text-emerald-800 underline">
              See more
            </Link>
          </div>
          <ul className="space-y-3">
            {recommended.map((v) => (
              <VacancyCard key={v.id} v={v} href={`/teacher/jobs/${v.id}`} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
