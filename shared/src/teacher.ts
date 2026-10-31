import { z } from 'zod';
import type { ScanStatus } from './uploads';

export const GENDERS = ['male', 'female', 'prefer_not_to_say'] as const;
export const JOB_TYPES = ['full_time', 'part_time', 'contract', 'tutoring'] as const;
export const EXPERIENCE_KINDS = ['job', 'nysc', 'teaching_practice'] as const;
export type Gender = (typeof GENDERS)[number];
export type JobType = (typeof JOB_TYPES)[number];
export type ExperienceKind = (typeof EXPERIENCE_KINDS)[number];

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  tutoring: 'Tutoring',
};
export const GENDER_LABELS: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
  prefer_not_to_say: 'Prefer not to say',
};
export const EXPERIENCE_KIND_LABELS: Record<ExperienceKind, string> = {
  job: 'Teaching job',
  nysc: 'NYSC',
  teaching_practice: 'Teaching practice',
};

/** Calendar date "YYYY-MM-DD". */
const dateSchema = z.iso.date('Enter a valid date');
const today = () => new Date().toISOString().slice(0, 10);
const notInFuture = (v: string) => v <= today();

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .transform((v) => (v ? v : undefined));

const slugList = (label: string) => z.array(z.string().trim().min(1)).min(1, `Choose at least one ${label}`).max(50);

// ───────────── FR-2 step 1: personal details ─────────────

export const personalSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120, 'Name is too long'),
  gender: z.enum(GENDERS, 'Choose an option'),
  dob: dateSchema.refine((v) => v >= '1900-01-01' && notInFuture(v), 'Enter a valid date of birth'),
  bio: optionalText(1000),
});
export type PersonalInput = z.input<typeof personalSchema>;

// ───────────── step 2: location ─────────────

/** State + LGA are required; street address and map pin are optional and never shown to schools. */
export const locationSchema = z
  .object({
    countryCode: z.literal('NG').default('NG'),
    stateId: z.uuid('Choose a state'),
    lgaId: z.uuid('Choose an LGA or city'),
    area: optionalText(120),
    addressLine: optionalText(200),
    lat: z.number().min(-90).max(90).nullish(),
    lng: z.number().min(-180).max(180).nullish(),
    willingToRelocate: z.boolean().default(false),
    preferredStates: z.array(z.string().trim().min(1)).max(37).default([]),
  })
  .refine((v) => (v.lat == null) === (v.lng == null), { message: 'Map pin needs both latitude and longitude', path: ['lat'] });
export type LocationInput = z.input<typeof locationSchema>;

// ───────────── step 3: qualifications ─────────────

const year = z.number().int().min(1950, 'Enter a valid year').refine((v) => v <= new Date().getFullYear(), 'Year cannot be in the future');

export const qualificationSchema = z.object({
  qualificationTypeId: z.uuid('Choose a qualification'),
  course: z.string().trim().min(2, 'Enter the course').max(150),
  institution: z.string().trim().min(2, 'Enter the institution').max(150),
  yearObtained: year,
  /** Optional certificate file from POST /uploads/sign (purpose qualification_file). */
  fileUploadId: z.uuid().optional(),
});
export const qualificationUpdateSchema = qualificationSchema.partial();
export type QualificationInput = z.input<typeof qualificationSchema>;

// ───────────── step 4: certifications ─────────────

const certificationFields = z.object({
  certificationTypeId: z.uuid('Choose a certification'),
  issuer: z.string().trim().min(2, 'Enter the issuer').max(150),
  number: z.string().trim().min(1, 'Enter the registration or certificate number').max(80),
  issuedAt: dateSchema.refine(notInFuture, 'Issue date cannot be in the future'),
  expiresAt: dateSchema.optional(),
  /** Certificate file from POST /uploads/sign (purpose certification_file). */
  fileUploadId: z.uuid('Upload the certificate'),
});
const expiryAfterIssue = (v: { issuedAt?: string; expiresAt?: string }) => !v.issuedAt || !v.expiresAt || v.expiresAt >= v.issuedAt;
const expiryIssue = { message: 'Expiry date must be after the issue date', path: ['expiresAt'] };

export const certificationSchema = certificationFields.refine(expiryAfterIssue, expiryIssue);
/** On edit the file is optional (keeps the current one) and the expiry can be cleared with null. */
export const certificationUpdateSchema = certificationFields
  .partial()
  .extend({ expiresAt: dateSchema.nullish() })
  .refine((v) => expiryAfterIssue({ issuedAt: v.issuedAt, expiresAt: v.expiresAt ?? undefined }), expiryIssue);
export type CertificationInput = z.input<typeof certificationSchema>;

// ───────────── step 5: work experience ─────────────

const experienceFields = z.object({
  /** "No experience yet": fresh graduates add an NYSC or teaching-practice entry. */
  kind: z.enum(EXPERIENCE_KINDS).default('job'),
  schoolName: z.string().trim().min(2, 'Enter the school name').max(150),
  role: z.string().trim().min(2, 'Enter your role').max(100),
  subjects: z.array(z.string().trim().min(1)).max(50).default([]),
  levels: z.array(z.string().trim().min(1)).max(10).default([]),
  startDate: dateSchema.refine(notInFuture, 'Start date cannot be in the future'),
  endDate: dateSchema.nullish(),
  isCurrent: z.boolean().default(false),
  description: optionalText(2000),
});
type ExperienceDates = { startDate?: string; endDate?: string | null; isCurrent?: boolean };
const datesConsistent = (v: ExperienceDates) =>
  v.isCurrent ? !v.endDate : v.isCurrent === false ? !!v.endDate : true;
const endAfterStart = (v: ExperienceDates) => !v.startDate || !v.endDate || v.endDate >= v.startDate;

export const experienceSchema = experienceFields
  .refine(datesConsistent, { message: 'Enter an end date, or tick "I work here now"', path: ['endDate'] })
  .refine(endAfterStart, { message: 'End date must be after the start date', path: ['endDate'] });
/** Defaults stripped so a field left out of the edit keeps its stored value. */
const e = experienceFields.shape;
export const experienceUpdateSchema = experienceFields
  .extend({ kind: e.kind.unwrap(), subjects: e.subjects.unwrap(), levels: e.levels.unwrap(), isCurrent: e.isCurrent.unwrap() })
  .partial()
  .refine(endAfterStart, { message: 'End date must be after the start date', path: ['endDate'] });
export type ExperienceInput = z.input<typeof experienceSchema>;

// ───────────── step 6: teaching preferences ─────────────

export const preferencesSchema = z
  .object({
    subjects: slugList('subject'),
    levels: slugList('level'),
    jobTypes: z.array(z.enum(JOB_TYPES)).min(1, 'Choose at least one job type'),
    expectedSalaryMin: z.number().int().positive('Must be more than 0').nullish(),
    expectedSalaryMax: z.number().int().positive('Must be more than 0').nullish(),
    availableFrom: dateSchema.nullish(),
  })
  .refine((v) => v.expectedSalaryMin == null || v.expectedSalaryMax == null || v.expectedSalaryMin <= v.expectedSalaryMax, {
    message: 'Minimum must not be more than maximum',
    path: ['expectedSalaryMax'],
  });
export type PreferencesInput = z.input<typeof preferencesSchema>;

// ───────────── completeness (confirmed weights, 2026-10-31) ─────────────

export const COMPLETENESS_ITEMS = [
  { key: 'cv', label: 'Active CV', weight: 20, required: true },
  { key: 'qualification', label: 'At least one qualification', weight: 15, required: true },
  { key: 'experience', label: 'Work experience (or NYSC / teaching practice)', weight: 15, required: true },
  { key: 'preferences', label: 'Teaching preferences', weight: 15, required: true },
  { key: 'location', label: 'Location', weight: 10, required: true },
  { key: 'personal', label: 'Personal details', weight: 10, required: true },
  { key: 'photo', label: 'Profile photo', weight: 10, required: false },
  { key: 'bio', label: 'Short bio', weight: 5, required: false },
] as const;
export type CompletenessKey = (typeof COMPLETENESS_ITEMS)[number]['key'];

export interface CompletenessResponse {
  score: number;
  /** Required items still missing; publishing fails with exactly this list. */
  missing: CompletenessKey[];
  canPublish: boolean;
  items: { key: CompletenessKey; label: string; weight: number; required: boolean; complete: boolean }[];
}

export function computeCompleteness(done: Partial<Record<CompletenessKey, boolean>>): CompletenessResponse {
  const items = COMPLETENESS_ITEMS.map((i) => ({ ...i, complete: !!done[i.key] }));
  const missing = items.filter((i) => i.required && !i.complete).map((i) => i.key);
  return {
    score: items.reduce((sum, i) => sum + (i.complete ? i.weight : 0), 0),
    missing,
    canPublish: missing.length === 0,
    items,
  };
}

// ───────────── responses (the teacher's own view; schools get a reduced view in Phase 7) ─────────────

export interface RefItem {
  id: string;
  name: string;
  slug: string;
}

export interface QualificationResponse {
  id: string;
  qualificationType: { id: string; name: string };
  course: string;
  institution: string;
  yearObtained: number;
  hasFile: boolean;
  fileScanStatus: ScanStatus | null;
}

export interface CertificationResponse {
  id: string;
  certificationType: { id: string; name: string };
  issuer: string;
  number: string;
  issuedAt: string | null;
  expiresAt: string | null;
  hasFile: boolean;
  fileScanStatus: ScanStatus | null;
}

export interface ExperienceResponse {
  id: string;
  kind: ExperienceKind;
  schoolName: string;
  role: string;
  subjects: string[];
  levels: string[];
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
}

export interface CvResponse {
  id: string;
  fileName: string;
  mimeType: 'pdf' | 'doc' | 'docx';
  sizeBytes: number;
  scanStatus: ScanStatus;
  isActive: boolean;
  uploadedAt: string;
  replacedAt: string | null;
  /** Signed links (10 minutes), only for clean files. viewUrl is the PDF (converted for DOC/DOCX). */
  downloadUrl: string | null;
  viewUrl: string | null;
}

export interface MyCvResponse {
  active: CvResponse | null;
  /** Uploads still being scanned/converted, or recently rejected (so the UI can say why). */
  pending: CvResponse[];
}

export interface TeacherProfileResponse {
  id: string;
  fullName: string | null;
  gender: Gender | null;
  dob: string | null;
  bio: string | null;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  location: {
    countryCode: string | null;
    state: RefItem | null;
    lga: RefItem | null;
    area: string | null;
    addressLine: string | null;
    lat: number | null;
    lng: number | null;
  };
  willingToRelocate: boolean;
  preferredStates: string[];
  subjects: string[];
  levels: string[];
  jobTypes: JobType[];
  expectedSalaryMin: number | null;
  expectedSalaryMax: number | null;
  availableFrom: string | null;
  yearsExperience: number;
  noExperienceYet: boolean;
  qualifications: QualificationResponse[];
  certifications: CertificationResponse[];
  experiences: ExperienceResponse[];
  cv: CvResponse | null;
  isPublished: boolean;
  publishedAt: string | null;
  completeness: CompletenessResponse;
}
