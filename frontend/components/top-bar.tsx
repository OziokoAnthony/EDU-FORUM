'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_NAME } from '@edu-forum/shared';
import { SearchIcon } from './icons';

export type Tab = { href: string; label: string; icon: React.ReactNode; exact?: boolean };

const isActive = (path: string, t: Tab) => (t.exact ? path === t.href : path === t.href || path.startsWith(`${t.href}/`));

/** The round "E" mark + name. Our own mark, not anyone else's logo. */
export function Logo({ href = '/', compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2" aria-label={`${APP_NAME} home`}>
      <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-xl font-extrabold text-white">
        E
      </span>
      <span className={`${compact ? 'hidden lg:block' : 'hidden sm:block'} text-xl font-extrabold tracking-tight text-brand`}>{APP_NAME}</span>
    </Link>
  );
}

/**
 * Sticky white bar across the top of every page (Facebook-like layout, user 2026-11-01):
 * logo and search on the left, main tabs in the middle, actions on the right. Signed-in
 * pages also get <BottomTabs> on phones; public pages show the tabs in a row underneath.
 */
export function TopBar({
  logoHref = '/',
  search,
  tabs = [],
  right,
  mobileTabs = 'row',
}: {
  logoHref?: string;
  search?: { action: string; placeholder: string };
  tabs?: Tab[];
  right?: React.ReactNode;
  /** 'row': tabs under the bar on phones; 'bottom': shown by <BottomTabs> instead. */
  mobileTabs?: 'row' | 'bottom';
}) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-panel shadow-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Logo href={logoHref} compact={!!search} />
          {search ? (
            <form action={search.action} role="search" className="hidden min-w-0 md:block">
              <label className="flex h-10 w-60 items-center gap-2 rounded-full bg-slate-100 px-3 text-slate-500 focus-within:ring-2 focus-within:ring-brand/40">
                <SearchIcon className="h-4 w-4 shrink-0" />
                <span className="sr-only">{search.placeholder}</span>
                <input name="q" type="search" placeholder={search.placeholder} className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none" />
              </label>
            </form>
          ) : null}
        </div>

        {tabs.length ? (
          <nav aria-label="Main" className="hidden h-full items-stretch md:flex">
            {tabs.map((t) => {
              const on = isActive(path, t);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={on ? 'page' : undefined}
                  title={t.label}
                  className={`relative flex w-20 flex-col items-center justify-center gap-0.5 text-xs font-semibold lg:w-28 ${
                    on ? 'text-brand after:absolute after:inset-x-1 after:bottom-0 after:h-[3px] after:rounded-t after:bg-brand' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </Link>
              );
            })}
          </nav>
        ) : null}

        <div className="flex flex-1 items-center justify-end gap-2">
          {search ? (
            <Link href={search.action} aria-label={search.placeholder} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 md:hidden">
              <SearchIcon className="h-5 w-5" />
            </Link>
          ) : null}
          {right}
        </div>
      </div>

      {tabs.length && mobileTabs === 'row' ? (
        <nav aria-label="Main" className="flex border-t border-slate-200 md:hidden">
          {tabs.map((t) => {
            const on = isActive(path, t);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={on ? 'page' : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-xs font-semibold ${on ? 'border-b-[3px] border-brand text-brand' : 'border-b-[3px] border-transparent text-slate-500'}`}
              >
                {t.icon}
                {t.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </header>
  );
}

/** Phone-only bottom tab bar for signed-in pages (thumb reach). */
export function BottomTabs({ tabs }: { tabs: Tab[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-panel shadow-sm pb-[env(safe-area-inset-bottom)] md:hidden">
      {tabs.map((t) => {
        const on = isActive(path, t);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${on ? 'text-brand' : 'text-slate-500'}`}
          >
            {t.icon}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
