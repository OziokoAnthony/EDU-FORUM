'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { UserRole } from '@edu-forum/shared';
import { AuthProvider, homeFor, useAuth } from '@/lib/auth';
import { RealtimeProvider } from '@/lib/realtime';
import { NotificationBell } from './notification-bell';
import { SiteBanner } from './site-banner';

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

  return (
    <RealtimeProvider enabled={user.role !== 'admin'}>
      <header className="mx-auto max-w-6xl sm:px-4">
        <SiteBanner compact>
        <div className="flex items-center gap-2">
        {user.role !== 'admin' ? <NotificationBell href={user.role === 'teacher' ? '/teacher/notifications' : '/hiring/notifications'} /> : null}
        <button
          type="button"
          onClick={async () => {
            await logout();
            router.replace('/login');
          }}
          className="rounded-sm border border-gold/60 bg-black/40 px-3 py-1.5 font-heading text-sm uppercase tracking-[0.12em] text-gold hover:bg-black/60"
        >
          Sign out
        </button>
        </div>
        </SiteBanner>
      </header>
      <div className="animate-fade-in">{children}</div>
    </RealtimeProvider>
  );
}
