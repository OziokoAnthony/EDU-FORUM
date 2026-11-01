'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

/**
 * "Use a different account" on the confirm-email and confirm-phone pages: without it, a signed-in
 * but unconfirmed user is sent back here from /login and cannot switch accounts.
 */
export function SwitchAccount() {
  const { status, logout } = useAuth();
  const router = useRouter();
  if (status !== 'signed-in') return null;
  return (
    <button
      type="button"
      onClick={async () => {
        await logout();
        router.replace('/login');
      }}
      className="block w-full text-center text-sm font-semibold text-brand hover:underline"
    >
      Sign out and use a different account
    </button>
  );
}
