import type { Metadata } from 'next';
import Link from 'next/link';
import {
  breadcrumbJsonLd,
  CLASS_LEVELS,
  MATERIAL_KIND_LABELS,
  MATERIAL_KINDS,
  MATERIALS_PAGE_SIZE,
  TERM_LABELS,
  TERMS,
  type ListResponse,
  type MaterialItem,
  type MetaItem,
  type Paginated,
} from '@edu-forum/shared';
import { JsonLd } from '@/components/json-ld';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { MaterialCard } from '@/components/resources/resource-bits';
import { getSeoMeta, toMetadata } from '@/lib/seo-metadata';
import { serverGet, SITE_URL } from '@/lib/server-api';

type Search = { q?: string; kind?: string; subject?: string; classLevel?: string; term?: string; page?: string };
type Props = { searchParams: Promise<Search> };
const filtered = (s: Search) => !!(s.q || s.kind || s.subject || s.classLevel || s.term || (s.page && s.page !== '1'));

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { data: meta } = await getSeoMeta('/resources');
  // Filtered and paged lists are noindex (canonical /resources), like job search.
  return meta ? toMetadata(meta, { noindex: filtered(await searchParams) }) : {};
}

/** `/resources`: lesson notes, schemes of work… uploaded by admins (user, 2026-11-01). */
export default async function Page({ searchParams }: Props) {
  const s = await searchParams;
  const page = Math.max(1, Number(s.page) || 1);
  const q = new URLSearchParams({ page: String(page), limit: String(MATERIALS_PAGE_SIZE) });
  for (const k of ['q', 'kind', 'subject', 'classLevel', 'term'] as const) if (s[k]) q.set(k, String(s[k]).slice(0, 100));
  const [{ data: meta }, { data: results }, { data: subjects }] = await Promise.all([
    getSeoMeta('/resources'),
    serverGet<Paginated<MaterialItem>>(`/materials?${q}`, ['resources']),
    serverGet<ListResponse<MetaItem>>('/meta/subjects', ['meta']),
  ]);
  const items = results?.data ?? [];
  const total = results?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / MATERIALS_PAGE_SIZE));
  const crumbs = meta?.breadcrumbs ?? [{ name: 'Home', path: '/' }, { name: 'Teaching resources', path: '/resources' }];
  const pageLink = (p: number) => {
    const next = new URLSearchParams(Object.entries(s).filter(([k, v]) => k !== 'page' && v) as [string, string][]);
    if (p > 1) next.set('page', String(p));
    const str = next.toString();
    return `/resources${str ? `?${str}` : ''}`;
  };
  const select = 'block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5';

  return (
    <main className="space-y-5 px-4 py-6 sm:px-0">
      <JsonLd data={breadcrumbJsonLd(crumbs, SITE_URL)} />
      <Breadcrumbs crumbs={crumbs} />
      <div className="space-y-1">
        <h1 className="text-3xl text-slate-900">Teaching resources</h1>
        <p className="text-slate-600">Lesson notes, schemes of work, lesson plans and past questions for Nigerian classrooms. Free to download for members.</p>
      </div>

      <form method="get" action="/resources" className="grid gap-3 rounded-lg bg-panel p-4 shadow-sm sm:grid-cols-6">
        <label className="space-y-1 sm:col-span-2">
          <span className="block text-sm font-medium text-slate-800">Search</span>
          <input name="q" defaultValue={s.q} placeholder="e.g. photosynthesis, fractions" className={select} />
        </label>
        <label className="space-y-1">
          <span className="block text-sm font-medium text-slate-800">Type</span>
          <select name="kind" defaultValue={s.kind ?? ''} className={select}>
            <option value="">All types</option>
            {MATERIAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {MATERIAL_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-sm font-medium text-slate-800">Subject</span>
          <select name="subject" defaultValue={s.subject ?? ''} className={select}>
            <option value="">All subjects</option>
            {(subjects?.data ?? []).map((sub) => (
              <option key={sub.slug} value={sub.slug}>
                {sub.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-sm font-medium text-slate-800">Class</span>
          <select name="classLevel" defaultValue={s.classLevel ?? ''} className={select}>
            <option value="">All classes</option>
            {CLASS_LEVELS.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-sm font-medium text-slate-800">Term</span>
          <select name="term" defaultValue={s.term ?? ''} className={select}>
            <option value="">All terms</option>
            {TERMS.map((t) => (
              <option key={t} value={t}>
                {TERM_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-600 sm:col-span-6">
          Find resources
        </button>
      </form>

      <p className="text-slate-600" aria-live="polite">
        {total.toLocaleString('en-NG')} {total === 1 ? 'resource' : 'resources'}
      </p>
      {items.length === 0 ? (
        <p className="rounded-lg bg-panel p-6 text-center text-slate-600 shadow-sm">Nothing here yet. Try fewer filters.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {items.map((m) => (
            <MaterialCard key={m.id} m={m} />
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-center gap-3">
          {page > 1 ? (
            <Link href={pageLink(page - 1)} className="rounded-md bg-panel px-4 py-2 font-semibold text-slate-700 shadow-sm">
              ← Newer
            </Link>
          ) : null}
          <span className="text-sm text-slate-600">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={pageLink(page + 1)} className="rounded-md bg-panel px-4 py-2 font-semibold text-slate-700 shadow-sm">
              Older →
            </Link>
          ) : null}
        </nav>
      ) : null}
      <p className="text-sm text-slate-600">
        Also see the <Link href="/calendar" className="font-semibold text-brand hover:underline">school calendar</Link> and{' '}
        <Link href="/exams" className="font-semibold text-brand hover:underline">exam timetables</Link>.
      </p>
    </main>
  );
}
