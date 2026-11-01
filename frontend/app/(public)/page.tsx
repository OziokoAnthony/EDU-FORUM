import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME, jobPath, websiteJsonLd, type LandingPageItem, type Paginated, type VacancyListItem } from '@edu-forum/shared';
import { JsonLd } from '@/components/json-ld';
import { HeroSlider } from '@/components/public/hero-slider';
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
    <main className="px-2 sm:px-0">
      <JsonLd data={websiteJsonLd(SITE_URL)} />
      <div className="mt-3 px-0">
        <HeroSlider />
      </div>
      <section className="mt-3 space-y-4 rounded-lg border border-slate-200 bg-panel shadow-sm px-4 py-6 sm:px-8">
        <h1 className="animate-fade-up text-3xl text-slate-900 sm:text-4xl">Teaching jobs near you, in every Nigerian state</h1>
        <p className="animate-fade-up text-slate-600 [animation-delay:80ms]">
          Teachers find jobs by subject, level and distance and apply free with their CV. Principals and directors post vacancies and find
          qualified teachers. {APP_NAME} is free for everyone.
        </p>
        <form method="get" action="/jobs" role="search" className="flex animate-scale-in gap-2 [animation-delay:160ms]">
          <label htmlFor="home-q" className="sr-only">
            Search teaching jobs
          </label>
          <input id="home-q" name="q" placeholder="Subject, level or keyword" className="block w-full rounded-sm border border-slate-300 px-3 py-3 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30" />
          <button type="submit" className="rounded-sm bg-emerald-700 px-5  text-white hover:bg-emerald-600">
            Search
          </button>
        </form>
      </section>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-3">

      {latest?.data.length ? (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-panel shadow-sm p-4 sm:p-6">
          <h2 className="text-2xl text-slate-900">Latest teaching jobs</h2>
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

      </div>
      <aside className="space-y-3">
      {states.length ? (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-panel shadow-sm p-4">
          <h2 className="text-2xl text-slate-900">Jobs by state</h2>
          <ul className="stagger grid grid-cols-2 gap-2 lg:grid-cols-1">
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
      <section className="space-y-3 rounded-lg border border-slate-200 bg-panel shadow-sm p-4">
        <h2 className="text-2xl text-slate-900">Join free</h2>
        <p className="text-sm text-slate-600">Teachers upload a CV once and apply to any job. Principals and directors post vacancies and chat with teachers.</p>
        <div className="flex flex-col gap-2 text-sm font-semibold">
          <Link href="/register" className="press lift rounded-sm border border-gold px-4 py-2 text-center text-gold">
            I am a teacher
          </Link>
          <Link href="/register" className="press lift rounded-sm border border-gold px-4 py-2 text-center text-gold">
            I am hiring (principal or director)
          </Link>
        </div>
      </section>
      </aside>
      </div>
    </main>
  );
}
