import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME, jobPath, websiteJsonLd, type LandingPageItem, type Paginated, type VacancyListItem } from '@edu-forum/shared';
import { JsonLd } from '@/components/json-ld';
import { VacancyCard } from '@/components/vacancy-card';
import { getSeoMeta, toMetadata } from '@/lib/seo-metadata';
import { serverGet, SITE_URL } from '@/lib/server-api';

// Rendered per request (data still comes from the tagged fetch cache), so builds never
// need the API running and pages never serve build-time data.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { data: meta } = await getSeoMeta('/');
  return meta ? toMetadata(meta) : { title: { absolute: APP_NAME } };
}

/** Home: search, latest jobs and the busiest states (WebSite + SearchAction JSON-LD). */
export default async function HomePage() {
  const [{ data: latest }, { data: landing }] = await Promise.all([
    serverGet<Paginated<VacancyListItem>>('/vacancies?sort=newest&limit=6', ['vacancies']),
    serverGet<{ data: LandingPageItem[] }>('/seo/landing-pages', ['vacancies', 'seo']),
  ]);
  const states = (landing?.data ?? []).filter((p) => p.kind === 'state').sort((a, b) => b.liveJobs - a.liveJobs).slice(0, 12);

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-4 py-8">
      <JsonLd data={websiteJsonLd(SITE_URL)} />
      <section className="space-y-4">
        <h1 className="text-3xl font-bold text-slate-900">Teaching jobs near you, in every Nigerian state</h1>
        <p className="text-slate-600">
          Teachers find jobs by subject, level and distance and apply free with their CV. Principals and directors post vacancies and find
          qualified teachers. {APP_NAME} is free for everyone.
        </p>
        <form method="get" action="/jobs" role="search" className="flex gap-2">
          <label htmlFor="home-q" className="sr-only">
            Search teaching jobs
          </label>
          <input id="home-q" name="q" placeholder="Subject, level or keyword" className="block w-full rounded-lg border border-slate-300 px-3 py-3" />
          <button type="submit" className="rounded-lg bg-emerald-700 px-5 font-semibold text-white">
            Search
          </button>
        </form>
        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          <Link href="/register" className="rounded-lg border border-emerald-700 px-4 py-2 text-emerald-800">
            I am a teacher
          </Link>
          <Link href="/register" className="rounded-lg border border-emerald-700 px-4 py-2 text-emerald-800">
            I am hiring (principal or director)
          </Link>
        </div>
      </section>

      {latest?.data.length ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Latest teaching jobs</h2>
          <ul className="space-y-3">
            {latest.data.map((v) => (
              <VacancyCard key={v.id} v={v} href={jobPath(v)} />
            ))}
          </ul>
          <Link href="/jobs" className="inline-block font-semibold text-emerald-800 underline">
            See all jobs
          </Link>
        </section>
      ) : null}

      {states.length ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Jobs by state</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {states.map((p) => (
              <li key={p.path}>
                <Link href={p.path} className="block rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
                  {p.label.replace('Teaching jobs in ', '')} <span className="text-sm text-slate-500">({p.liveJobs})</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
