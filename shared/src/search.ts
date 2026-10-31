import { z } from 'zod';
import { JOB_TYPES, type JobType, type RefItem } from './teacher';
import type { SalaryPeriod, SchoolType } from './vacancy';

/** PRD FR-5 distance choices; "anywhere" = no radius. Only these, so exact distances cannot be probed. */
export const RADIUS_OPTIONS_KM = [5, 10, 25, 50] as const;

/** Match score weights (CLAUDE.md): total 100. */
export const MATCH_WEIGHTS = { subjects: 30, levels: 20, qualification: 15, experience: 15, certifications: 10, distance: 10 } as const;
/** Distance points fall linearly from 10 at 0 km to 0 at this distance. */
export const MATCH_DISTANCE_LIMIT_KM = 50;

/** `?subjects=a,b` or repeated `?subjects=a&subjects=b`. */
const list = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) =>
    (Array.isArray(v) ? v : (v ?? '').split(','))
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20),
  );
const optionalNumber = z.coerce.number().optional();
const radius = z.coerce
  .number()
  .refine((v) => (RADIUS_OPTIONS_KM as readonly number[]).includes(v), `Choose ${RADIUS_OPTIONS_KM.join(', ')} km`)
  .optional();
const page = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};
const point = {
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: radius,
};
const bothOrNeither = (v: { lat?: number; lng?: number }) => (v.lat == null) === (v.lng == null);
const pointIssue = { message: 'Give both lat and lng', path: ['lat'] };

/** GET /vacancies (public). `verifiedOnly` from the PRD is gone with verification. */
export const vacancySearchSchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    subjects: list,
    levels: list,
    jobType: z.enum(JOB_TYPES).optional(),
    salaryMin: optionalNumber,
    state: z.string().trim().toLowerCase().optional(),
    lga: z.string().trim().toLowerCase().optional(),
    ...point,
    postedWithin: z.coerce.number().int().refine((v) => [1, 3, 7, 14, 30].includes(v), 'Choose 1, 3, 7, 14 or 30 days').optional(),
    sort: z.enum(['relevance', 'distance', 'newest', 'salary']).default('relevance'),
    ...page,
  })
  .refine(bothOrNeither, pointIssue);
export type VacancySearchQuery = z.input<typeof vacancySearchSchema>;

/** GET /teachers (principals and directors). */
export const teacherSearchSchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    subjects: list,
    levels: list,
    /** Qualification type slug; teachers holding it or a higher one match. */
    qualification: z.string().trim().optional(),
    minExperience: z.coerce.number().min(0).max(50).optional(),
    /** Certification type slug, e.g. "trcn-registration". */
    certification: z.string().trim().optional(),
    state: z.string().trim().toLowerCase().optional(),
    lga: z.string().trim().toLowerCase().optional(),
    ...point,
    willingToRelocate: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),
    /** Available on or before this date (or no date given). */
    availableBy: z.iso.date().optional(),
    /** Budget: teachers whose expected minimum is at or below it (or not stated). */
    maxSalary: optionalNumber,
    sort: z.enum(['match', 'distance', 'experience', 'updated']).default('match'),
    ...page,
  })
  .refine(bothOrNeither, pointIssue);
export type TeacherSearchQuery = z.input<typeof teacherSearchSchema>;

export interface VacancyListItem {
  id: string;
  slug: string;
  shortId: string;
  title: string;
  /** The school name, or "Confidential school". */
  schoolLabel: string;
  isAnonymous: boolean;
  schoolType: SchoolType | null;
  state: RefItem;
  lga: RefItem;
  subjects: string[];
  levels: string[];
  jobType: JobType;
  salaryMin: number;
  salaryMax: number;
  salaryPeriod: SalaryPeriod;
  /** First ~200 visible characters of the description. */
  excerpt: string;
  publishedAt: string;
  deadline: string | null;
  /** Rounded km; null when no origin, no pin, or the vacancy is anonymous. */
  distanceKm: number | null;
  /** 0–100 for a signed-in teacher; null otherwise. */
  matchScore: number | null;
}

/** What principals and directors see in teacher search. Never the address or map pin. */
export interface TeacherListItem {
  id: string;
  fullName: string;
  photoUrl: string | null;
  state: RefItem | null;
  lga: RefItem | null;
  distanceKm: number | null;
  subjects: string[];
  levels: string[];
  jobTypes: JobType[];
  yearsExperience: number;
  noExperienceYet: boolean;
  highestQualification: string | null;
  certifications: string[];
  willingToRelocate: boolean;
  availableFrom: string | null;
  expectedSalaryMin: number | null;
  expectedSalaryMax: number | null;
  completenessScore: number;
  matchScore: number;
  updatedAt: string;
}

/** GET /teachers/:id for principals and directors: full profile + contact (user, 2026-10-31). */
export interface TeacherViewResponse extends TeacherListItem {
  bio: string | null;
  gender: 'male' | 'female' | 'prefer_not_to_say' | null;
  phone: string | null;
  email: string | null;
  preferredStates: string[];
  qualifications: { id: string; type: string; course: string; institution: string; yearObtained: number }[];
  certificationDetails: { id: string; type: string; issuer: string; number: string; issuedAt: string | null; expiresAt: string | null }[];
  experiences: {
    id: string;
    kind: 'job' | 'nysc' | 'teaching_practice';
    schoolName: string;
    role: string;
    subjects: string[];
    levels: string[];
    startDate: string;
    endDate: string | null;
    isCurrent: boolean;
    description: string | null;
  }[];
  cv: { fileName: string; mimeType: 'pdf' | 'doc' | 'docx'; uploadedAt: string } | null;
}

export const cvLinkQuerySchema = z.object({
  download: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

/** GET /teachers/:id/cv: a 10-minute signed link (view = PDF, download = original file). */
export interface CvLinkResponse {
  url: string;
  fileName: string;
  mimeType: 'pdf' | 'doc' | 'docx';
  expiresAt: string;
}
