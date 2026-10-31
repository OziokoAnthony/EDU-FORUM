'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { AdminStats } from '@edu-forum/shared';
import { Alert } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { AdminNav } from './admin-nav';

function Tile({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <>
      <p className="text-2xl font-bold text-slate-900">{value.toLocaleString('en-NG')}</p>
      <p className="text-sm text-slate-600">{label}</p>
    </>
  );
  return href ? (
    <Link href={href} className="rounded-lg border border-slate-200 p-4 hover:bg-slate-50">
      {body}
    </Link>
  ) : (
    <div className="rounded-lg border border-slate-200 p-4">{body}</div>
  );
}

/** FR-11 platform analytics. */
export default function Page() {
  const { authed } = useAuth();
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => authed<AdminStats>('/admin/stats'), staleTime: 0 });
  const s = stats.data;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <AdminNav current="overview" />
      <h1 className="text-2xl font-bold text-slate-900">Admin overview</h1>
      {stats.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : stats.isError || !s ? (
        <Alert>Could not load the stats.</Alert>
      ) : (
        <div className="space-y-6">
          {s.reports.open ? (
            <Alert kind="info">
              {s.reports.open} open report{s.reports.open === 1 ? '' : 's'} waiting.{' '}
              <Link href="/admin/reports" className="font-semibold underline">
                Review now
              </Link>
            </Alert>
          ) : null}
          <section className="space-y-2">
            <h2 className="font-semibold text-slate-900">People</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Tile label="Teachers" value={s.users.teachers} href="/admin/users?role=teacher" />
              <Tile label="Principals" value={s.users.principals} href="/admin/users?role=principal" />
              <Tile label="Directors" value={s.users.directors} href="/admin/users?role=director" />
              <Tile label="Suspended" value={s.users.suspended} href="/admin/users?status=suspended" />
              <Tile label="New this week" value={s.users.newThisWeek} />
            </div>
          </section>
          <section className="space-y-2">
            <h2 className="font-semibold text-slate-900">Teacher profiles</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Tile label="Published" value={s.teachers.published} />
              <Tile label="With a CV" value={s.teachers.withCv} />
              <Tile label="Hidden by admin" value={s.teachers.hiddenByAdmin} href="/admin/teachers?hidden=true" />
            </div>
          </section>
          <section className="space-y-2">
            <h2 className="font-semibold text-slate-900">Vacancies and applications</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Live vacancies" value={s.vacancies.live} href="/admin/vacancies?status=published" />
              <Tile label="Posted this week" value={s.vacancies.postedThisWeek} />
              <Tile label="Taken down" value={s.vacancies.takenDown} href="/admin/vacancies?takenDown=true" />
              <Tile label="Closed" value={s.vacancies.closed} />
              <Tile label="Applications" value={s.applications.total} />
              <Tile label="Applications this week" value={s.applications.thisWeek} />
              <Tile label="Hired" value={s.applications.hired} />
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
