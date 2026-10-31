import { z } from 'zod';
import type { TeacherListItem, VacancyListItem } from './search';

export const APPLICATION_STATUSES = ['applied', 'viewed', 'shortlisted', 'interview', 'offered', 'hired', 'rejected', 'withdrawn'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** The forward pipeline (CLAUDE.md). Rejected/withdrawn can happen from any non-final step. */
export const PIPELINE: ApplicationStatus[] = ['applied', 'viewed', 'shortlisted', 'interview', 'offered', 'hired'];
export const FINAL_STATUSES: ApplicationStatus[] = ['hired', 'rejected', 'withdrawn'];
/** What a principal/director may move an applicant to ("withdrawn" is the teacher's alone). */
export const POSTER_STATUSES = ['viewed', 'shortlisted', 'interview', 'offered', 'hired', 'rejected'] as const;

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  viewed: 'Viewed',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offered: 'Offered',
  hired: 'Hired',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
};

/** Moves forward only (steps may be skipped); rejected from any non-final step; finals stay. */
export function canMove(from: ApplicationStatus, to: ApplicationStatus): boolean {
  if (FINAL_STATUSES.includes(from) || from === to) return false;
  if (to === 'rejected' || to === 'withdrawn') return true;
  return PIPELINE.indexOf(to) > PIPELINE.indexOf(from);
}

/** POST /vacancies/:id/applications */
export const applySchema = z.object({
  coverNote: z
    .string()
    .trim()
    .max(2000, 'Keep the cover note under 2,000 characters')
    .optional()
    .transform((v) => (v ? v : undefined)),
  screeningAnswers: z
    .array(z.object({ questionId: z.uuid(), answer: z.string().trim().min(1, 'Answer this question').max(1000) }))
    .max(5)
    .default([]),
});
export type ApplyInput = z.input<typeof applySchema>;

const message = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .transform((v) => (v ? v : undefined));

/** PATCH /applications/:id/status. `closeVacancy` on "hired" closes the vacancy as filled (FR-7.6). */
export const moveStatusSchema = z.object({
  status: z.enum(POSTER_STATUSES),
  message,
  closeVacancy: z.boolean().default(false),
});

export const bulkStatusSchema = z.object({
  applicationIds: z.array(z.uuid()).min(1, 'Choose at least one applicant').max(100),
  status: z.enum(POSTER_STATUSES),
  message,
});

export const ratingSchema = z.object({ rating: z.number().int().min(1).max(5).nullable() });
export const noteSchema = z.object({ body: z.string().trim().min(1, 'Write a note').max(2000) });

export const applicantsQuerySchema = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(['match', 'newest', 'rating']).default('match'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const myApplicationsQuerySchema = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export interface ScreeningAnswer {
  questionId: string;
  question: string;
  answer: string;
}

export interface HistoryEntry {
  id: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  message: string | null;
  /** "Teacher", "Principal" or "Director". */
  by: string;
  at: string;
}

/** The teacher's own view of an application. */
export interface MyApplicationResponse {
  id: string;
  status: ApplicationStatus;
  appliedAt: string;
  updatedAt: string;
  coverNote: string | null;
  screeningAnswers: ScreeningAnswer[];
  cvFileName: string;
  /** Anonymous vacancies show "Confidential school" until the teacher is shortlisted. */
  vacancy: Pick<VacancyListItem, 'id' | 'title' | 'schoolLabel' | 'isAnonymous' | 'state' | 'lga' | 'salaryMin' | 'salaryMax' | 'salaryPeriod'> & {
    status: 'draft' | 'published' | 'paused' | 'closed';
  };
  history: HistoryEntry[];
}

/** An applicant as the vacancy's poster sees them (contact always shown, user 2026-10-31). */
export interface ApplicantResponse {
  id: string;
  status: ApplicationStatus;
  rating: number | null;
  matchScore: number;
  appliedAt: string;
  updatedAt: string;
  coverNote: string | null;
  screeningAnswers: ScreeningAnswer[];
  cv: { fileName: string; mimeType: 'pdf' | 'doc' | 'docx' };
  teacher: Omit<TeacherListItem, 'matchScore' | 'distanceKm'> & { phone: string | null; email: string | null };
  vacancy: { id: string; title: string; openings: number };
}

export interface ApplicantDetailResponse extends ApplicantResponse {
  history: HistoryEntry[];
  notes: { id: string; body: string; mine: boolean; at: string }[];
}

export interface MoveStatusResponse {
  application: ApplicantResponse;
  /** True once hires reach the vacancy's openings, so the UI can offer to close it. */
  openingsFilled: boolean;
  vacancyClosed: boolean;
}

export interface BulkStatusResponse {
  updated: string[];
  skipped: { id: string; reason: string }[];
}
