'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  CertificationTypeItem,
  LgaItem,
  ListResponse,
  MetaItem,
  QualificationTypeItem,
  StateItem,
} from '@edu-forum/shared';
import { api } from './api';

/** Reference lists change rarely; keep them for the whole visit. */
const HOUR = 60 * 60 * 1000;

function useList<T>(key: unknown[], path: string, enabled = true) {
  return useQuery({
    queryKey: ['meta', ...key],
    queryFn: async () => (await api<ListResponse<T>>(path)).data,
    staleTime: HOUR,
    enabled,
  });
}

export const useSubjects = () => useList<MetaItem>(['subjects'], '/meta/subjects');
export const useLevels = () => useList<MetaItem>(['levels'], '/meta/levels');
export const useQualificationTypes = () => useList<QualificationTypeItem>(['qualification-types'], '/meta/qualification-types');
export const useCertificationTypes = () => useList<CertificationTypeItem>(['certification-types'], '/meta/certification-types');
export const useStates = () => useList<StateItem>(['states'], '/meta/locations/states');
export const useLgas = (stateId: string | undefined) =>
  useList<LgaItem>(['lgas', stateId], `/meta/locations/lgas?state=${stateId ?? ''}`, !!stateId);

/** slug → name, for showing saved slugs (subjects, levels, states). */
export function nameBySlug(items: MetaItem[] | undefined): (slug: string) => string {
  const map = new Map(items?.map((i) => [i.slug, i.name]));
  return (slug) => map.get(slug) ?? slug;
}
