import Link from 'next/link';
import { APP_NAME } from '@edu-forum/shared';
import { SiteBanner } from '@/components/site-banner';

const TABS = [
  { href: '/', label: 'Home' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/login', label: 'Sign in' },
];

/**
 * Public, indexable pages (home, jobs, landing pages). Server-rendered with no client auth
 * state, so pages stay fast and cacheable. The AdSense script joins this layout only (Phase 12).
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl sm:px-4">
      <header>
        <SiteBanner />
        <nav aria-label="Main" className="mt-2 flex items-center gap-1 overflow-x-auto rounded-md border border-slate-200 bg-panel p-1.5 sm:mx-0">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="shrink-0 rounded-sm px-4 py-2 font-heading text-sm uppercase tracking-[0.12em] text-slate-800 hover:bg-slate-100 hover:text-gold"
            >
              {t.label}
            </Link>
          ))}
          <Link href="/register" className="ml-auto shrink-0 rounded-sm bg-emerald-700 px-4 py-2 font-heading text-sm uppercase tracking-[0.12em] text-white hover:bg-emerald-600">
            Join free
          </Link>
        </nav>
      </header>
      {children}
      <footer className="mt-12 rounded-t-md border border-b-0 border-slate-200 bg-panel">
        <div className="space-y-2 px-4 py-8 text-sm text-slate-600">
          <p>
            {APP_NAME} is free for teachers, principals and directors. We never charge to apply or to post a job, so never pay anyone who asks
            for a fee.
          </p>
          <p className="flex flex-wrap gap-4">
            <Link href="/jobs" className="text-gold underline">
              All teaching jobs
            </Link>
            <Link href="/jobs/lagos" className="text-gold underline">
              Jobs in Lagos
            </Link>
            <Link href="/jobs/fct" className="text-gold underline">
              Jobs in Abuja (FCT)
            </Link>
            <Link href="/jobs/rivers" className="text-gold underline">
              Jobs in Rivers
            </Link>
          </p>
          <p className="text-xs text-slate-500">
            Photos from <Link href="https://www.pexels.com" className="underline">Pexels</Link> (free licence).
          </p>
        </div>
      </footer>
    </div>
  );
}
