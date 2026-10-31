'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthTokensResponse, MeResponse, UserRole } from '@edu-forum/shared';
import { api, ApiError, type ApiOptions } from './api';

type Status = 'loading' | 'signed-in' | 'signed-out';

interface AuthContextValue {
  status: Status;
  user: MeResponse | null;
  /** Stores the session returned by register/login/change-password. */
  setSession(res: AuthTokensResponse): void;
  /** Calls the API with the access token, refreshing it once on 401. */
  authed<T>(path: string, options?: ApiOptions): Promise<T>;
  reloadUser(): Promise<MeResponse | null>;
  logout(): Promise<void>;
  /** The current access token (for the `/ws` handshake); `fresh` forces a refresh first. */
  accessToken(fresh?: boolean): Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Access token lives in memory only; the refresh token is an httpOnly cookie the browser
 * sends to /auth/refresh. On load we try a refresh to restore the session.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<MeResponse | null>(null);
  const token = useRef<string | null>(null);
  const refreshing = useRef<Promise<string | null> | null>(null);

  const refresh = useCallback(() => {
    // One refresh at a time: the server rotates the token, so parallel calls would collide.
    refreshing.current ??= api<{ accessToken: string }>('/auth/refresh', { method: 'POST', body: {} })
      .then((r) => (token.current = r.accessToken))
      .catch(() => (token.current = null))
      .finally(() => (refreshing.current = null));
    return refreshing.current;
  }, []);

  const authed = useCallback(
    async <T,>(path: string, options: ApiOptions = {}): Promise<T> => {
      if (!token.current) await refresh();
      try {
        return await api<T>(path, { ...options, accessToken: token.current });
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 401) throw err;
        if (!(await refresh())) {
          setUser(null);
          setStatus('signed-out');
          throw err;
        }
        return api<T>(path, { ...options, accessToken: token.current });
      }
    },
    [refresh],
  );

  const reloadUser = useCallback(async () => {
    try {
      const me = await authed<MeResponse>('/me');
      setUser(me);
      setStatus('signed-in');
      return me;
    } catch {
      setUser(null);
      setStatus('signed-out');
      return null;
    }
  }, [authed]);

  useEffect(() => {
    void reloadUser();
  }, [reloadUser]);

  const setSession = useCallback((res: AuthTokensResponse) => {
    token.current = res.accessToken;
    setUser(res.user);
    setStatus('signed-in');
  }, []);

  const logout = useCallback(async () => {
    await authed('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
    token.current = null;
    setUser(null);
    setStatus('signed-out');
  }, [authed]);

  const accessToken = useCallback(async (fresh = false) => (fresh || !token.current ? refresh() : token.current), [refresh]);

  const value = useMemo(
    () => ({ status, user, setSession, authed, reloadUser, logout, accessToken }),
    [status, user, setSession, authed, reloadUser, logout, accessToken],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Where a signed-in user goes: verification first, then their role's area. */
export function homeFor(user: Pick<MeResponse, 'role' | 'verified' | 'email'>): string {
  if (!user.verified) return user.email ? '/verify-email' : '/verify-phone';
  const homes: Record<UserRole, string> = {
    teacher: '/teacher',
    principal: '/hiring',
    director: '/hiring',
    admin: '/admin',
  };
  return homes[user.role];
}
