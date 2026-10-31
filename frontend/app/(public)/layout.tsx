import Link from 'next/link';
import { APP_NAME } from '@edu-forum/shared';

/**
 * Public, indexable pages (home, jobs, landing pages). Server-rendered with no client auth
 * state, so pages stay fast and cacheable. The AdSense script joins this layout only (Phase 12).
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-slate-200">
        <nav aria-label="Main" className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-lg font-bold text-emerald-800">
            {APP_NAME}
          </Link>
          <div className="flex items-center gap-4 text-sm font-semibold">
            <Link href="/jobs" className="text-slate-700 hover:text-emerald-800">
              Jobs
            </Link>
            <Link href="/login" className="text-slate-700 hover:text-emerald-800">
              Sign in
            </Link>
            <Link href="/register" className="rounded-lg bg-emerald-700 px-3 py-2 text-white hover:bg-emerald-800">
              Join free
            </Link>
          </div>
        </nav>
      </header>
      {children}
      <footer className="mt-16 border-t border-slate-200">
        <div className="mx-auto max-w-5xl space-y-2 px-4 py-8 text-sm text-slate-600">
          <p>
            {APP_NAME} is free for teachers, principals and directors. We never charge to apply or to post a job, so never pay anyone who asks
            for a fee.
          </p>
          <p className="flex flex-wrap gap-4">
            <Link href="/jobs" className="underline">
              All teaching jobs
            </Link>
            <Link href="/jobs/lagos" className="underline">
              Jobs in Lagos
            </Link>
            <Link href="/jobs/fct" className="underline">
              Jobs in Abuja (FCT)
            </Link>
            <Link href="/jobs/rivers" className="underline">
              Jobs in Rivers
            </Link>
          </p>
        </div>
      </footer>
    </>
  );
}
