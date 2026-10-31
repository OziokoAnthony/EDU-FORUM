'use client';

import Link from 'next/link';
import { useLiveNotifications, useUnreadCount } from '@/lib/notifications';

/** Header bell with the unread count, kept live over `/ws`. */
export function NotificationBell({ href }: { href: string }) {
  useLiveNotifications(true);
  const unread = useUnreadCount(true);
  const count = unread.data?.count ?? 0;
  return (
    <Link
      href={href}
      aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
      className="relative flex h-9 w-9 items-center justify-center rounded-sm border border-gold/60 bg-black/40 text-gold hover:bg-black/60"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {count ? (
        <span className="absolute -right-1.5 -top-1.5 min-w-5 animate-scale-in rounded-full bg-red-500 px-1 text-center text-xs font-bold leading-5 text-white">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
