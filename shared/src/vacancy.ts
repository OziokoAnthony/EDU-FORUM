import { z } from 'zod';
import { JOB_TYPES, type JobType, type RefItem } from './teacher';

export const SALARY_PERIODS = ['monthly', 'annual', 'hourly'] as const;
export const LOCATION_VISIBILITIES = ['listed', 'anonymous'] as const;
export const VACANCY_STATUSES = ['draft', 'published', 'paused', 'closed'] as const;
export const CLOSE_REASONS = ['filled', 'cancelled'] as const;
export const BENEFITS = ['accommodation', 'transport', 'feeding', 'hmo'] as const;
export const SCHOOL_TYPES = ['nursery', 'primary', 'secondary', 'combined', 'tertiary', 'tutorial_centre'] as const;
export const SCREENING_TYPES = ['text', 'yes_no'] as const;

export type SalaryPeriod = (typeof SALARY_PERIODS)[number];
export type LocationVisibility = (typeof LOCATION_VISIBILITIES)[number];
export type VacancyStatus = (typeof VACANCY_STATUSES)[number];
export type Benefit = (typeof BENEFITS)[number];
export type SchoolType = (typeof SCHOOL_TYPES)[number];

export const SALARY_PERIOD_LABELS: Record<SalaryPeriod, string> = { monthly: 'per month', annual: 'per year', hourly: 'per hour' };
export const BENEFIT_LABELS: Record<Benefit, string> = {
  accommodation: 'Accommodation',
  transport: 'Transport',
  feeding: 'Feeding',
  hmo: 'HMO (health insurance)',
};
export const SCHOOL_TYPE_LABELS: Record<SchoolType, string> = {
  nursery: 'Nursery school',
  primary: 'Primary school',
  secondary: 'Secondary school',
  combined: 'Nursery to secondary',
  tertiary: 'Tertiary institution',
  tutorial_centre: 'Tutorial centre',
};
export const VACANCY_STATUS_LABELS: Record<VacancyStatus, string> = {
  draft: 'Draft',
  published: 'Live',
  paused: 'Paused',
  closed: 'Closed',
};

/** Shown instead of the school name on anonymous vacancies (CLAUDE.md vacancy rules). */
export const CONFIDENTIAL_SCHOOL = 'Confidential school';
export const DESCRIPTION_MIN_CHARS = 100;
export const MAX_SCREENING_QUESTIONS = 5;
/** PRD FR-4: the application deadline defaults to 30 days after publishing. */
export const DEFAULT_DEADLINE_DAYS = 30;

/** Visible characters of rich-text HTML (tags and entities removed), for the 100-character rule. */
export function textLength(html: string): number {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, 'x')
    .replace(/\s+/g, ' ')
    .trim().length;
}

const dateSchema = z.iso.date('Enter a valid date');
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .transform((v) => (v ? v : undefined));
const salary = z.number({ error: 'Enter an amount' }).int('Whole naira only').positive('Must be more than 0');

const vacancyFields = z.object({
  title: z.string().trim().min(3, 'Enter a job title').max(120, 'Title is too long'),
  subjects: z.array(z.string().trim().min(1)).min(1, 'Choose at least one subject').max(20),
  levels: z.array(z.string().trim().min(1)).min(1, 'Choose at least one level').max(10),
  jobType: z.enum(JOB_TYPES, 'Choose the job type'),
  salaryMin: salary,
  salaryMax: salary,
  salaryCurrency: z.literal('NGN').default('NGN'),
  salaryPeriod: z.enum(SALARY_PERIODS).default('monthly'),
  /** Rich text (HTML from the editor); the API sanitises it. */
  description: z
    .string()
    .max(20_000, 'Description is too long')
    .refine((v) => textLength(v) >= DESCRIPTION_MIN_CHARS, `Write at least ${DESCRIPTION_MIN_CHARS} characters`),

  locationVisibility: z.enum(LOCATION_VISIBILITIES).default('listed'),
  schoolName: optionalText(150),
  schoolType: z.enum(SCHOOL_TYPES).nullish(),
  stateId: z.uuid('Choose a state'),
  lgaId: z.uuid('Choose an LGA or city'),
  area: optionalText(120),
  addressLine: optionalText(200),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),

  requiredQualifications: z.array(z.string().trim().min(1)).max(20).default([]),
  minExperienceYears: z.number().int().min(0).max(50).nullish(),
  requiredCertifications: z.array(z.string().trim().min(1)).max(10).default([]),
  openings: z.number().int().min(1, 'At least 1').max(500).default(1),
  benefits: z.array(z.enum(BENEFITS)).default([]),
  screeningQuestions: z
    .array(
      z.object({
        /** Kept across edits so applicants' answers stay linked to their question. */
        id: z.uuid().optional(),
        question: z.string().trim().min(3, 'Write the question').max(200),
        type: z.enum(SCREENING_TYPES).default('text'),
      }),
    )
    .max(MAX_SCREENING_QUESTIONS, `At most ${MAX_SCREENING_QUESTIONS} questions`)
    .default([]),
  deadline: dateSchema.nullish(),
  startDate: dateSchema.nullish(),
});

type Rules = {
  salaryMin?: number;
  salaryMax?: number;
  locationVisibility?: LocationVisibility;
  schoolName?: string;
  lat?: number | null;
  lng?: number | null;
};
const vacancyRules = <T extends z.ZodType<Rules>>(schema: T) =>
  schema
    .refine((v) => v.salaryMin == null || v.salaryMax == null || v.salaryMin <= v.salaryMax, {
      message: 'Minimum salary must not be more than the maximum',
      path: ['salaryMax'],
    })
    .refine((v) => v.locationVisibility !== 'listed' || !!v.schoolName, {
      message: 'Enter the school name, or post anonymously',
      path: ['schoolName'],
    })
    .refine((v) => (v.lat == null) === (v.lng == null), { message: 'Map pin needs both latitude and longitude', path: ['lat'] });

/** POST /vacancies. Every required field is needed even for a draft (PRD endpoint table). */
export const createVacancySchema = vacancyRules(vacancyFields.extend({ publish: z.boolean().default(false) }));
export type CreateVacancyInput = z.input<typeof createVacancySchema>;

/**
 * PATCH /vacancies/:id. Defaults are stripped so a field left out of the edit keeps its
 * stored value (otherwise "change the title" would reset benefits, questions, etc.).
 * The API re-checks the merged result against the full rules.
 */
const s = vacancyFields.shape;
export const updateVacancySchema = vacancyFields
  .extend({
    salaryCurrency: s.salaryCurrency.unwrap(),
    salaryPeriod: s.salaryPeriod.unwrap(),
    locationVisibility: s.locationVisibility.unwrap(),
    requiredQualifications: s.requiredQualifications.unwrap(),
    requiredCertifications: s.requiredCertifications.unwrap(),
    openings: s.openings.unwrap(),
    benefits: s.benefits.unwrap(),
    screeningQuestions: s.screeningQuestions.unwrap(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateVacancyInput = z.input<typeof updateVacancySchema>;
/** The full rules, for re-checking an edited vacancy. */
export const vacancyRecordSchema = vacancyRules(vacancyFields);

export const closeVacancySchema = z.object({ reason: z.enum(CLOSE_REASONS).default('filled') });

export const myVacanciesQuerySchema = z.object({
  status: z.enum(VACANCY_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export interface ScreeningQuestion {
  id: string;
  question: string;
  type: (typeof SCREENING_TYPES)[number];
}

/**
 * GET /vacancies/:id. For an anonymous vacancy the school name, address, area and map pin
 * are null and `schoolLabel` is "Confidential school", unless the caller is its poster or a
 * shortlisted / invited teacher (`revealed`). Enforced in the API serializer.
 */
export interface VacancyResponse {
  id: string;
  slug: string;
  shortId: string;
  title: string;
  subjects: string[];
  levels: string[];
  jobType: JobType;
  salaryMin: number;
  salaryMax: number;
  salaryCurrency: string;
  salaryPeriod: SalaryPeriod;
  description: string;
  isAnonymous: boolean;
  /** The school name, or "Confidential school". */
  schoolLabel: string;
  schoolName: string | null;
  schoolType: SchoolType | null;
  location: {
    state: RefItem;
    lga: RefItem;
    area: string | null;
    addressLine: string | null;
    lat: number | null;
    lng: number | null;
  };
  requiredQualifications: string[];
  minExperienceYears: number | null;
  requiredCertifications: string[];
  openings: number;
  benefits: Benefit[];
  screeningQuestions: ScreeningQuestion[];
  deadline: string | null;
  startDate: string | null;
  status: VacancyStatus;
  publishedAt: string | null;
  closedAt: string | null;
  /** "Principal" or "Director": the poster's title, never their name or contact. */
  postedBy: 'Principal' | 'Director';
  revealed: boolean;
}

/** The poster's own view (GET /vacancies/mine): everything, plus counts. */
export interface MyVacancyResponse extends VacancyResponse {
  locationVisibility: LocationVisibility;
  applicantsCount: number;
  closeReason: string | null;
  createdAt: string;
  updatedAt: string;
}
