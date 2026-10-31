import {
  CONFIDENTIAL_SCHOOL,
  type MyVacancyResponse,
  type ScreeningQuestion,
  type VacancyResponse,
} from '@edu-forum/shared';
import { fromDbDate } from '../../common/dates';
import type { Lga, State, User, Vacancy } from '../../generated/prisma/client';

export type VacancyRow = Vacancy & {
  state: Pick<State, 'id' | 'name' | 'slug'>;
  lga: Pick<Lga, 'id' | 'name' | 'slug'>;
  createdBy: Pick<User, 'role'>;
};

export const VACANCY_INCLUDE = {
  state: { select: { id: true, name: true, slug: true } },
  lga: { select: { id: true, name: true, slug: true } },
  createdBy: { select: { role: true } },
} as const;

/**
 * The only place a vacancy is turned into JSON (CLAUDE.md: enforce anonymity in the
 * serializer). For an anonymous vacancy the school name, address, area and map pin are
 * removed unless `reveal` is true (the poster, or a shortlisted / invited teacher).
 */
export function toVacancyResponse(v: VacancyRow, reveal: boolean): VacancyResponse {
  const anonymous = v.locationVisibility === 'anonymous';
  const hide = anonymous && !reveal;
  return {
    id: v.id,
    slug: v.slug,
    shortId: v.shortId,
    title: v.title,
    subjects: v.subjects,
    levels: v.levels,
    jobType: v.jobType,
    salaryMin: v.salaryMin,
    salaryMax: v.salaryMax,
    salaryCurrency: v.salaryCurrency,
    salaryPeriod: v.salaryPeriod,
    description: v.description,
    isAnonymous: anonymous,
    schoolLabel: hide || !v.schoolName ? CONFIDENTIAL_SCHOOL : v.schoolName,
    schoolName: hide ? null : v.schoolName,
    schoolType: v.schoolType,
    location: {
      state: v.state,
      lga: v.lga,
      area: hide ? null : v.area,
      addressLine: hide ? null : v.addressLine,
      lat: hide ? null : v.lat,
      lng: hide ? null : v.lng,
    },
    requiredQualifications: v.requiredQualifications,
    minExperienceYears: v.minExperienceYears,
    requiredCertifications: v.requiredCertifications,
    openings: v.openings,
    benefits: v.benefits as VacancyResponse['benefits'],
    screeningQuestions: v.screeningQuestions as unknown as ScreeningQuestion[],
    deadline: fromDbDate(v.deadline),
    startDate: fromDbDate(v.startDate),
    status: v.status,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    closedAt: v.closedAt?.toISOString() ?? null,
    postedBy: v.createdBy.role === 'principal' ? 'Principal' : 'Director',
    revealed: anonymous && reveal,
  };
}

export function toMyVacancyResponse(v: VacancyRow, applicantsCount: number): MyVacancyResponse {
  return {
    ...toVacancyResponse(v, true),
    locationVisibility: v.locationVisibility,
    applicantsCount,
    closeReason: v.closeReason,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}
