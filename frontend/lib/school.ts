'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MembersResponse, OnboardingResponse, SchoolResponse } from '@edu-forum/shared';
import { ApiError } from './api';
import { useAuth } from './auth';

export const SCHOOL_KEY = ['school', 'me'];
export const MEMBERS_KEY = ['school', 'members'];
export const ONBOARDING_KEY = ['me', 'onboarding'];

/** The caller's school, or null before they have created one. */
export function useMySchool() {
  const { authed } = useAuth();
  return useQuery({
    queryKey: SCHOOL_KEY,
    queryFn: async () => {
      try {
        return await authed<SchoolResponse>('/schools/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
}

export function useMembers(enabled = true) {
  const { authed } = useAuth();
  return useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: () => authed<MembersResponse>('/schools/me/members'),
    enabled,
    // Invites are accepted by other people, so never trust a cached list.
    staleTime: 0,
  });
}

export function useOnboarding() {
  const { authed } = useAuth();
  return useQuery({ queryKey: ONBOARDING_KEY, queryFn: () => authed<OnboardingResponse>('/me/onboarding') });
}

export function useRefreshSchool() {
  const qc = useQueryClient();
  return (school?: SchoolResponse) => {
    if (school) qc.setQueryData(SCHOOL_KEY, school);
    else void qc.invalidateQueries({ queryKey: SCHOOL_KEY });
    void qc.invalidateQueries({ queryKey: MEMBERS_KEY });
    void qc.invalidateQueries({ queryKey: ONBOARDING_KEY });
  };
}
