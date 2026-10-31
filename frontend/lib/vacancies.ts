'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MyVacancyResponse, Paginated, VacancyStatus } from '@edu-forum/shared';
import { useAuth } from './auth';

export const MY_VACANCIES_KEY = ['vacancies', 'mine'];

export function useMyVacancies(status?: VacancyStatus) {
  const { authed } = useAuth();
  return useQuery({
    queryKey: [...MY_VACANCIES_KEY, status ?? 'all'],
    queryFn: () => authed<Paginated<MyVacancyResponse>>(`/vacancies/mine?limit=50${status ? `&status=${status}` : ''}`),
  });
}

export function useMyVacancy(id: string) {
  const { authed } = useAuth();
  return useQuery({ queryKey: [...MY_VACANCIES_KEY, 'one', id], queryFn: () => authed<MyVacancyResponse>(`/vacancies/mine/${id}`) });
}

export function useRefreshVacancies() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: MY_VACANCIES_KEY });
}
