'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MyCvResponse, TeacherProfileResponse } from '@edu-forum/shared';
import { useAuth } from './auth';

export const PROFILE_KEY = ['teacher', 'me'];
export const CV_KEY = ['teacher', 'cv'];

const hasPendingFiles = (p: TeacherProfileResponse | undefined) =>
  !!p &&
  [...p.qualifications, ...p.certifications].some((i) => i.fileScanStatus === 'pending');

/** The signed-in teacher's own profile. Refreshes every few seconds while a file is being scanned. */
export function useMyProfile() {
  const { authed } = useAuth();
  return useQuery({
    queryKey: PROFILE_KEY,
    queryFn: () => authed<TeacherProfileResponse>('/teachers/me'),
    refetchInterval: (q) => (hasPendingFiles(q.state.data) ? 3000 : false),
  });
}

export function useMyCv() {
  const { authed } = useAuth();
  const qc = useQueryClient();
  return useQuery({
    queryKey: CV_KEY,
    queryFn: async () => {
      const cv = await authed<MyCvResponse>('/teachers/me/cv');
      // The scan finishes in the background: once a new CV turns active, the profile's
      // completeness changes too.
      const profile = qc.getQueryData<TeacherProfileResponse>(PROFILE_KEY);
      if (profile && profile.cv?.id !== cv.active?.id) void qc.invalidateQueries({ queryKey: PROFILE_KEY });
      return cv;
    },
    // Virus scan + DOC→PDF run in the background; poll until they finish.
    refetchInterval: (q) => (q.state.data?.pending.some((c) => c.scanStatus === 'pending') ? 2000 : false),
  });
}

/** After any save: the profile, CV and completeness all change together. */
export function useRefreshTeacher() {
  const qc = useQueryClient();
  return (profile?: TeacherProfileResponse) => {
    if (profile) qc.setQueryData(PROFILE_KEY, profile);
    else void qc.invalidateQueries({ queryKey: PROFILE_KEY });
    void qc.invalidateQueries({ queryKey: CV_KEY });
  };
}
