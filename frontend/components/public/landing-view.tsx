import Link from 'next/link';
import { breadcrumbJsonLd, jobPath, type Paginated, type SeoMeta, type VacancyListItem } from '@edu-forum/shared';
import { JsonLd } from '@/components/json-ld';
import { VacancyCard } from '@/components/vacancy-card';
import { serverGet, SITE_URL } from '@/lib/server-api';
import { Breadcrumbs } from './breadcrumbs';

const PAGE_SIZE = 20;

/** A state, LGA, subject or state×subject landing page (SSR, cached, refreshed on job changes). */
export async function LandingView({ meta, page }: { meta: SeoMeta; page: number }) {
  const q = new URLSearchParams({ sort: 'newest', limit: String(PAGE_SIZE), page: String(page) });
  if (meta.filters.state) q.set('state', meta.filters.state);
  if (meta.filters.lga) q.set('lga', meta.filters.lga);
  if (meta.filters.subject) q.set('subjects', meta.filters.subject);
  const { data } = await serverGet<Paginated<VacancyListItem>>(`/vacancies?${q}`, ['vacancies']);
  const jobs = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <JsonLd data={breadcrumbJsonLd(meta.breadcrumbs, SITE_URL)} />
      <Breadcrumbs crumbs={meta.breadcrumbs} />
      <div>
        <h1 className="animate-fade-up text-2xl font-bold text-slate-900">{meta.h1}</h1>
        <p className="mt-1 text-slate-600">
          {total} live job{total === 1 ? '' : 's'}. Free to apply.
        </p>
      </div>
      {jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
          <p>No live jobs here right now.</p>
          <Link href="/jobs" className="mt-2 inline-block font-semibold text-emerald-800 underline">
            See all teaching jobs
          </Link>
        </div>
      ) : (
        <ul className="stagger space-y-3">
          {jobs.map((v) => (
            <VacancyCard key={v.id} v={v} href={jobPath(v)} />
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <nav aria-label="Pages" className="flex justify-between text-sm font-semibold">
          {page > 1 ? (
            <Link href={`${meta.canonical}${page - 1 > 1 ? `?page=${page - 1}` : ''}`} className="text-emerald-800 underline">
              ← Newer jobs
            </Link>
          ) : (
            <span />
          )}
          {page < pages ? (
            <Link href={`${meta.canonical}?page=${page + 1}`} className="text-emerald-800 underline">
              Older jobs →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}
