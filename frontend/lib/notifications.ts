'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WS_EVENTS } from '@edu-forum/shared';
import { useAuth } from './auth';
import { useSocketEvent } from './realtime';

export const NOTIFICATIONS_KEY = ['notifications'] as const;
export const UNREAD_KEY = ['notifications', 'unread'] as const;

/** Keeps the unread badge and notification list live over the shared `/ws` connection. */
export function useLiveNotifications(): void {
  const qc = useQueryClient();
  useSocketEvent<{ count: number }>(WS_EVENTS.unreadCount, ({ count }) => qc.setQueryData(UNREAD_KEY, { count }));
  useSocketEvent(WS_EVENTS.notification, () => void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY, exact: false }));
}

/** Falls back to a slow poll so the badge still updates if sockets are blocked. */
export function useUnreadCount(enabled: boolean) {
  const { authed } = useAuth();
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: () => authed<{ count: number }>('/notifications/unread-count'),
    enabled,
    refetchInterval: 120_000,
  });
}
