'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL } from './api';
import { useAuth } from './auth';

/** The API's origin: `/ws` sits beside `/api/v1`, not under it. */
const WS_ORIGIN = new URL(API_URL).origin;

const SocketContext = createContext<Socket | null>(null);

/**
 * One `/ws` connection per tab, shared by the bell and the chat (Socket.IO reconnects by
 * itself on flaky networks). If the server refuses an expired token, we refresh it once and
 * reconnect.
 */
export function RealtimeProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const { accessToken } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let retried = false;
    let refused = false;
    const s = io(WS_ORIGIN, {
      path: '/ws',
      transports: ['websocket'],
      auth: (cb) => void accessToken(retried).then((token) => cb({ token })),
    });
    s.on('connect', () => (retried = false));
    s.on('unauthorized', () => (refused = true));
    // The server drops refused sockets itself, and Socket.IO does not reconnect after that.
    s.on('disconnect', (reason) => {
      if (reason !== 'io server disconnect' || !refused || retried) return;
      refused = false;
      retried = true;
      s.connect();
    });
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [enabled, accessToken]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

/** Runs `handler` for every `event` pushed by the server while the component is mounted. */
export function useSocketEvent<T>(event: string, handler: (data: T) => void): void {
  const socket = useContext(SocketContext);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!socket) return;
    const listener = (data: T) => latest.current(data);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
