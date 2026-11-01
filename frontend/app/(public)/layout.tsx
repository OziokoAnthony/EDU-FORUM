import Link from 'next/link';
import { APP_NAME } from '@edu-forum/shared';
import { BookIcon, HomeIcon, JobsIcon } from '@/components/icons';
import { TopBar } from '@/components/top-bar';

const TABS = [
  { href: '/', label: 'Home', icon: <HomeIcon />, exact: true },
  { href: '/jobs', label: 'Jobs', icon: <JobsIcon /> },
  { href: '/blog', label: 'Blog', icon: <BookIcon /> },
];

/**
 * Public, indexable pages (home, jobs, landing pages). Server-rendered with no client auth
 * state, so pages stay fast and cacheable. The AdSense script joins this layout only (Phase 12).
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar
        search={{ action: '/jobs', placeholder: 'Search teaching jobs' }}
        tabs={TABS}
        right={
          <>
            <Link href="/login" className="hidden rounded-md px-3 py-2 font-semibold text-brand hover:bg-slate-100 sm:block">
              Sign in
            </Link>
            <Link href="/register" className="rounded-md bg-emerald-700 px-3 py-2 font-semibold text-white hover:bg-emerald-600">
              Join free
            </Link>
          </>
        }
      />
      <div className="mx-auto max-w-6xl sm:px-4">{children}</div>
      <footer className="mt-12 border-t border-slate-200 bg-panel shadow-sm">
        <div className="mx-auto max-w-6xl space-y-2 px-4 py-8 text-sm text-slate-600">
          <p>
            {APP_NAME} is free for teachers, principals and directors. We never charge to apply or to post a job, so never pay anyone who asks
            for a fee.
          </p>
          <p className="flex flex-wrap gap-4">
            <Link href="/login" className="text-brand hover:underline sm:hidden">
              Sign in
            </Link>
            <Link href="/jobs" className="text-brand hover:underline">
              All teaching jobs
            </Link>
            <Link href="/jobs/lagos" className="text-brand hover:underline">
              Jobs in Lagos
            </Link>
            <Link href="/jobs/fct" className="text-brand hover:underline">
              Jobs in Abuja (FCT)
            </Link>
            <Link href="/jobs/rivers" className="text-brand hover:underline">
              Jobs in Rivers
            </Link>
          </p>
          <p className="text-xs text-slate-500">
            Photos from <Link href="https://www.pexels.com" className="underline">Pexels</Link> (free licence).
          </p>
        </div>
      </footer>
    </>
  );
}
