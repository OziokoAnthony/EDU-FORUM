import type { Metadata } from 'next';
import Link from 'next/link';
import {
  breadcrumbJsonLd,
  jobPath,
  type ListResponse,
  type MetaItem,
  type Paginated,
  type StateItem,
  type VacancyListItem,
} from '@edu-forum/shared';
import { JsonLd } from '@/components/json-ld';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { VacancyCard } from '@/components/vacancy-card';
import { getSeoMeta, toMetadata } from '@/lib/seo-metadata';
import { serverGet, SITE_URL } from '@/lib/server-api';

type Search = { q?: string; state?: string; subjects?: string; page?: string };
type Props = { searchParams: Promise<Search> };

const PAGE_SIZE = 20;
const filtered = (s: Search) => !!(s.q || s.state || s.subjects || (s.page && s.page !== '1'));

/** `/jobs`: all live jobs with simple filters (works without JavaScript: a plain GET form). */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { data: meta } = await getSeoMeta('/jobs');
  // Filtered result pages are noindex (canonical /jobs); the landing pages cover those queries.
  return meta ? toMetadata(meta, { noindex: filtered(await searchParams) }) : {};
}

export default async function Page({ searchParams }: Props) {
  const s = await searchParams;
  const page = Math.max(1, Number(s.page) || 1);
  const q = new URLSearchParams({ sort: 'newest', limit: String(PAGE_SIZE), page: String(page) });
  if (s.q) q.set('q', s.q.slice(0, 100));
  if (s.state) q.set('state', s.state);
  if (s.subjects) q.set('subjects', s.subjects);
  const [{ data: meta }, { data: results }, { data: states }, { data: subjects }] = await Promise.all([
    getSeoMeta('/jobs'),
    serverGet<Paginated<VacancyListItem>>(`/vacancies?${q}`, ['vacancies']),
    serverGet<ListResponse<StateItem>>('/meta/locations/states', ['meta']),
    serverGet<ListResponse<MetaItem>>('/meta/subjects', ['meta']),
  ]);
  const jobs = results?.data ?? [];
  const total = results?.meta.total ?? 0;
  const crumbs = meta?.breadcrumbs ?? [{ name: 'Home', path: '/' }, { name: 'Jobs', path: '/jobs' }];
  const pageLink = (p: number) => {
    const next = new URLSearchParams(Object.entries(s).filter(([k, v]) => k !== 'page' && v) as [string, string][]);
    if (p > 1) next.set('page', String(p));
    const str = next.toString();
    return `/jobs${str ? `?${str}` : ''}`;
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <JsonLd data={breadcrumbJsonLd(crumbs, SITE_URL)} />
      <Breadcrumbs crumbs={crumbs} />
      <h1 className="text-2xl font-bold text-slate-900">Teaching jobs in Nigeria</h1>

      <form method="get" action="/jobs" className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-4">
        <label className="space-y-1 sm:col-span-2">
          <span className="block text-sm font-medium text-slate-800">Keyword</span>
          <input name="q" defaultValue={s.q} placeholder="e.g. Physics, Montessori" className="block w-full rounded-lg border border-slate-300 px-3 py-2.5" />
        </label>
        <label className="space-y-1">
          <span className="block text-sm font-medium text-slate-800">State</span>
          <select name="state" defaultValue={s.state ?? ''} className="block w-full rounded-lg border border-slate-300 bg-panel shadow-sm px-3 py-2.5">
            <option value="">All states</option>
            {(states?.data ?? []).map((st) => (
              <option key={st.slug} value={st.slug}>
                {st.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-sm font-medium text-slate-800">Subject</span>
          <select name="subjects" defaultValue={s.subjects ?? ''} className="block w-full rounded-lg border border-slate-300 bg-panel shadow-sm px-3 py-2.5">
            <option value="">All subjects</option>
            {(subjects?.data ?? []).map((sub) => (
              <option key={sub.slug} value={sub.slug}>
                {sub.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white sm:col-span-4">
          Search jobs
        </button>
      </form>

      <p className="text-slate-600" aria-live="polite">
        {total} live job{total === 1 ? '' : 's'}
      </p>
      {jobs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">No jobs match. Try fewer filters.</p>
      ) : (
        <ul className="stagger space-y-3">
          {jobs.map((v) => (
            <VacancyCard key={v.id} v={v} href={jobPath(v)} />
          ))}
        </ul>
      )}
      <nav aria-label="Pages" className="flex justify-between text-sm font-semibold">
        {page > 1 ? (
          <Link href={pageLink(page - 1)} className="text-emerald-800 underline">
            ← Newer jobs
          </Link>
        ) : (
          <span />
        )}
        {page * PAGE_SIZE < total ? (
          <Link href={pageLink(page + 1)} className="text-emerald-800 underline">
            Older jobs →
          </Link>
        ) : null}
      </nav>
    </main>
  );
}
