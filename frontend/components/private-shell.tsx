'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { UserRole } from '@edu-forum/shared';
import { AuthProvider, homeFor, useAuth } from '@/lib/auth';
import { RealtimeProvider } from '@/lib/realtime';
import { DeletionCancelledNotice } from './account-settings';
import { NotificationBell } from './notification-bell';
import { BookmarkIcon, CalendarIcon, ChatIcon, FileIcon, HomeIcon, JobsIcon, MailIcon, PeopleIcon, ShieldIcon, TeachersIcon } from './icons';
import { BottomTabs, TopBar, type Tab } from './top-bar';

/**
 * Wraps a private area (teacher, hiring, admin): restores the session, sends signed-out
 * users to /login, unverified users to verification, and other roles to their own area.
 * The API enforces the same rules; this only keeps the UI from showing the wrong screens.
 */
export function PrivateShell({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Gate roles={roles}>{children}</Gate>
    </AuthProvider>
  );
}

function Gate({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const router = useRouter();
  const { status, user, logout } = useAuth();
  const allowed = status === 'signed-in' && user && user.verified && roles.includes(user.role);

  useEffect(() => {
    if (status === 'signed-out') router.replace('/login');
    else if (status === 'signed-in' && user && !allowed) router.replace(homeFor(user));
  }, [status, user, allowed, router]);

  if (!allowed) {
    return <p className="px-4 py-10 text-center text-slate-500">Loading…</p>;
  }

  const nav = NAV[user.role === 'teacher' ? 'teacher' : user.role === 'admin' ? 'admin' : 'hiring'];
  const signOut = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <RealtimeProvider enabled={user.role !== 'admin'}>
      <TopBar
        logoHref={nav.home}
        search={nav.search}
        tabs={nav.tabs}
        mobileTabs="bottom"
        right={
          <>
            {user.role !== 'admin' ? <NotificationBell href={`${nav.home}/notifications`} /> : null}
            <AccountMenu label={(user.email ?? user.phone ?? user.role).charAt(0).toUpperCase()} items={nav.menu} onSignOut={signOut} />
          </>
        }
      />
      <DeletionCancelledNotice />
      <div className="animate-fade-in pb-20 md:pb-0">{children}</div>
      <BottomTabs tabs={nav.tabs} />
    </RealtimeProvider>
  );
}

type Area = { home: string; search?: { action: string; placeholder: string }; tabs: Tab[]; menu: { href: string; label: string; icon: React.ReactNode }[] };
const ic = 'h-6 w-6';
const mi = 'h-5 w-5';

/** Main tabs and the account menu per area (Facebook-like layout, user 2026-11-01). */
const NAV: Record<'teacher' | 'hiring' | 'admin', Area> = {
  teacher: {
    home: '/teacher',
    search: { action: '/teacher/jobs', placeholder: 'Search teaching jobs' },
    tabs: [
      { href: '/teacher', label: 'Home', icon: <HomeIcon className={ic} />, exact: true },
      { href: '/teacher/jobs', label: 'Jobs', icon: <JobsIcon className={ic} /> },
      { href: '/teacher/community', label: 'Community', icon: <PeopleIcon className={ic} /> },
      { href: '/teacher/messages', label: 'Messages', icon: <ChatIcon className={ic} /> },
    ],
    menu: [
      { href: '/teacher/onboarding', label: 'My profile', icon: <TeachersIcon className={mi} /> },
      { href: '/teacher/cv', label: 'My CV', icon: <FileIcon className={mi} /> },
      { href: '/teacher/applications', label: 'Applications', icon: <JobsIcon className={mi} /> },
      { href: '/teacher/invitations', label: 'Invitations', icon: <MailIcon className={mi} /> },
      { href: '/teacher/interviews', label: 'Interviews', icon: <CalendarIcon className={mi} /> },
      { href: '/teacher/saved', label: 'Saved', icon: <BookmarkIcon className={mi} /> },
      { href: '/teacher/account', label: 'Account', icon: <ShieldIcon className={mi} /> },
    ],
  },
  hiring: {
    home: '/hiring',
    search: { action: '/hiring/teachers', placeholder: 'Search teachers' },
    tabs: [
      { href: '/hiring', label: 'Home', icon: <HomeIcon className={ic} />, exact: true },
      { href: '/hiring/teachers', label: 'Teachers', icon: <TeachersIcon className={ic} /> },
      { href: '/hiring/community', label: 'Community', icon: <PeopleIcon className={ic} /> },
      { href: '/hiring/messages', label: 'Messages', icon: <ChatIcon className={ic} /> },
    ],
    menu: [
      { href: '/hiring/vacancies/new', label: 'Post a vacancy', icon: <JobsIcon className={mi} /> },
      { href: '/hiring/invitations', label: 'Invitations', icon: <MailIcon className={mi} /> },
      { href: '/hiring/interviews', label: 'Interviews', icon: <CalendarIcon className={mi} /> },
      { href: '/hiring/saved', label: 'Saved', icon: <BookmarkIcon className={mi} /> },
      { href: '/hiring/account', label: 'Account', icon: <ShieldIcon className={mi} /> },
    ],
  },
  admin: {
    home: '/admin',
    tabs: [
      { href: '/admin', label: 'Overview', icon: <HomeIcon className={ic} />, exact: true },
      { href: '/admin/reports', label: 'Reports', icon: <ShieldIcon className={ic} /> },
      { href: '/admin/users', label: 'Users', icon: <PeopleIcon className={ic} /> },
      { href: '/admin/vacancies', label: 'Vacancies', icon: <JobsIcon className={ic} /> },
    ],
    menu: [],
  },
};

/** Round avatar button that opens the account menu (closes on outside click or Escape). */
function AccountMenu({ label, items, onSignOut }: { label: string; items: Area['menu']; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-700 hover:bg-slate-300"
      >
        {label}
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-64 animate-scale-in rounded-lg border border-slate-200 bg-panel p-2 shadow-xl">
          {items.map((i) => (
            <Link key={i.href} href={i.href} className="flex items-center gap-3 rounded-md px-2 py-2 font-semibold text-slate-800 hover:bg-slate-100">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700">{i.icon}</span>
              {i.label}
            </Link>
          ))}
          <button type="button" onClick={onSignOut} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left font-semibold text-slate-800 hover:bg-slate-100">
            <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700">⎋</span>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
