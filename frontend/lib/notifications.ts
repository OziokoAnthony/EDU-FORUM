'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { WS_EVENTS } from '@edu-forum/shared';
import { API_URL } from './api';
import { useAuth } from './auth';

export const NOTIFICATIONS_KEY = ['notifications'] as const;
export const UNREAD_KEY = ['notifications', 'unread'] as const;

/** The API's origin: `/ws` sits beside `/api/v1`, not under it. */
const WS_ORIGIN = new URL(API_URL).origin;

/**
 * Keeps the unread badge and notification list live over `/ws` (Socket.IO reconnects by
 * itself on flaky networks). If the server refuses an expired token, we refresh it once and
 * reconnect. Falls back to a slow poll so the badge still updates if sockets are blocked.
 */
export function useLiveNotifications(enabled: boolean): void {
  const { accessToken } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    let retried = false;
    const socket = io(WS_ORIGIN, {
      path: '/ws',
      transports: ['websocket'],
      auth: (cb) => void accessToken(retried).then((token) => cb({ token })),
    });
    socket.on(WS_EVENTS.unreadCount, ({ count }: { count: number }) => qc.setQueryData(UNREAD_KEY, { count }));
    socket.on(WS_EVENTS.notification, () => void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY, exact: false }));
    let refused = false;
    socket.on('connect', () => (retried = false));
    socket.on('unauthorized', () => (refused = true));
    // The server drops refused sockets itself, and Socket.IO does not reconnect after that.
    socket.on('disconnect', (reason) => {
      if (reason !== 'io server disconnect' || !refused || retried) return;
      refused = false;
      retried = true;
      socket.connect();
    });
    return () => {
      socket.disconnect();
    };
  }, [enabled, accessToken, qc]);
}

export function useUnreadCount(enabled: boolean) {
  const { authed } = useAuth();
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: () => authed<{ count: number }>('/notifications/unread-count'),
    enabled,
    refetchInterval: 120_000,
  });
}
