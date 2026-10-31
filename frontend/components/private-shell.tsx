'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { APP_NAME, type UserRole } from '@edu-forum/shared';
import { AuthProvider, homeFor, useAuth } from '@/lib/auth';

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
    <>
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-emerald-800">
          {APP_NAME}
        </Link>
        <button
          type="button"
          onClick={async () => {
            await logout();
            router.replace('/login');
          }}
          className="text-sm font-semibold text-slate-700 underline"
        >
          Sign out
        </button>
      </header>
      <div className="animate-fade-in">{children}</div>
    </>
  );
}
