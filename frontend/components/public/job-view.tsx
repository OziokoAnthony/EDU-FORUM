import Link from 'next/link';
import {
  BENEFIT_LABELS,
  breadcrumbJsonLd,
  JOB_TYPE_LABELS,
  jobPath,
  jobPostingJsonLd,
  SCHOOL_TYPE_LABELS,
  type JobPageResponse,
  type ListResponse,
  type MetaItem,
} from '@edu-forum/shared';
import { JsonLd } from '@/components/json-ld';
import { VacancyCard } from '@/components/vacancy-card';
import { salaryRange, shortDate } from '@/lib/format';
import { serverGet, SITE_URL } from '@/lib/server-api';
import { Breadcrumbs } from './breadcrumbs';

/**
 * The public job page. JobPosting markup only for live, listed jobs (anonymous and closed
 * jobs get none). Closed jobs say so and show similar jobs. Links to its state, LGA and
 * subject pages and to 5 similar jobs (PRD internal linking).
 */
export async function JobView({ page }: { page: JobPageResponse }) {
  const v = page.vacancy;
  const subjects = (await serverGet<ListResponse<MetaItem>>('/meta/subjects', ['meta'])).data?.data ?? [];
  const subjectName = (slug: string) => subjects.find((s) => s.slug === slug)?.name ?? slug;
  const closed = v.status !== 'published';
  const applyHref = `/login?next=${encodeURIComponent(`/teacher/jobs/${v.id}`)}`;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <JsonLd data={jobPostingJsonLd(v, SITE_URL)} />
      <JsonLd data={breadcrumbJsonLd(page.breadcrumbs, SITE_URL)} />
      <Breadcrumbs crumbs={page.breadcrumbs} />

      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">{v.title}</h1>
        <p className="text-slate-700">
          {v.schoolLabel}
          {v.schoolType ? ` · ${SCHOOL_TYPE_LABELS[v.schoolType]}` : ''}
        </p>
        <p className="text-slate-600">
          <Link href={`/jobs/${v.location.state.slug}/${v.location.lga.slug}`} className="underline">
            {v.location.lga.name}
          </Link>
          ,{' '}
          <Link href={`/jobs/${v.location.state.slug}`} className="underline">
            {v.location.state.name}
          </Link>
        </p>
        <p className="text-lg font-semibold text-slate-900">{salaryRange(v.salaryMin, v.salaryMax, v.salaryPeriod)}</p>
        <p className="text-sm text-slate-600">
          {JOB_TYPE_LABELS[v.jobType]} · {v.openings} opening{v.openings === 1 ? '' : 's'}
          {v.publishedAt ? ` · posted ${shortDate(v.publishedAt)}` : ''}
          {v.deadline && !closed ? ` · apply by ${shortDate(v.deadline)}` : ''}
        </p>
      </header>

      {closed ? (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 font-semibold text-amber-900">
          This position has closed. See similar jobs below.
        </p>
      ) : (
        <Link href={applyHref} className="flex w-full items-center justify-center rounded-lg bg-emerald-700 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-800 sm:w-auto sm:px-8">
          Apply free with your CV
        </Link>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">About the job</h2>
        <div
          className="space-y-2 text-slate-800 [&_a]:text-emerald-800 [&_a]:underline [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
          // Sanitised server-side (sanitize-html allow-list) before it is stored.
          dangerouslySetInnerHTML={{ __html: v.description }}
        />
      </section>

      <section className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-900">Subjects and levels</h2>
        <p className="flex flex-wrap gap-2">
          {v.subjects.map((s) => (
            <Link key={s} href={`/jobs/${v.location.state.slug}/${s}-teacher`} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-800 hover:bg-slate-200">
              {subjectName(s)} jobs in {v.location.state.name}
            </Link>
          ))}
        </p>
        {v.minExperienceYears ? <p className="text-slate-700">At least {v.minExperienceYears} years of experience.</p> : null}
        {v.benefits.length ? <p className="text-slate-700">Benefits: {v.benefits.map((b) => BENEFIT_LABELS[b]).join(', ')}</p> : null}
      </section>

      {page.similar.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Similar jobs</h2>
          <ul className="space-y-3">
            {page.similar.map((s) => (
              <VacancyCard key={s.id} v={s} href={jobPath(s)} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
