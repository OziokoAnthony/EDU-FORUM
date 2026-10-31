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
    <main>
      <JsonLd data={websiteJsonLd(SITE_URL)} />
      <section className="relative overflow-hidden bg-[linear-gradient(120deg,#ecfdf5,#ffffff,#fffbeb,#ecfdf5)] bg-[length:300%_300%] animate-gradient">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-20 -top-16 h-64 w-64 animate-float rounded-full bg-emerald-200/50 blur-3xl" />
          <div className="absolute -bottom-20 left-10 h-56 w-56 animate-float rounded-full bg-amber-200/40 blur-3xl [animation-delay:-4s]" />
        </div>
        <div className="relative mx-auto max-w-3xl space-y-4 px-4 py-12 sm:py-16">
        <h1 className="animate-fade-up text-3xl font-bold text-slate-900 sm:text-4xl">Teaching jobs near you, in every Nigerian state</h1>
        <p className="animate-fade-up text-slate-600 [animation-delay:80ms]">
          Teachers find jobs by subject, level and distance and apply free with their CV. Principals and directors post vacancies and find
          qualified teachers. {APP_NAME} is free for everyone.
        </p>
        <form method="get" action="/jobs" role="search" className="flex animate-scale-in gap-2 [animation-delay:160ms]">
          <label htmlFor="home-q" className="sr-only">
            Search teaching jobs
          </label>
          <input id="home-q" name="q" placeholder="Subject, level or keyword" className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 shadow-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20" />
          <button type="submit" className="rounded-lg bg-emerald-700 px-5 font-semibold text-white shadow-sm hover:bg-emerald-800">
            Search
          </button>
        </form>
        <div className="flex animate-fade-up flex-wrap gap-3 text-sm font-semibold [animation-delay:240ms]">
          <Link href="/register" className="press lift rounded-lg border border-emerald-700 bg-white/70 px-4 py-2 text-emerald-800">
            I am a teacher
          </Link>
          <Link href="/register" className="press lift rounded-lg border border-emerald-700 bg-white/70 px-4 py-2 text-emerald-800">
            I am hiring (principal or director)
          </Link>
        </div>
        </div>
      </section>
      <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">

      {latest?.data.length ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Latest teaching jobs</h2>
          <ul className="stagger space-y-3">
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
          <ul className="stagger grid grid-cols-2 gap-2 sm:grid-cols-3">
            {states.map((p) => (
              <li key={p.path}>
                <Link href={p.path} className="lift block rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
                  {p.label.replace('Teaching jobs in ', '')} <span className="text-sm text-slate-500">({p.liveJobs})</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      </div>
    </main>
  );
}
