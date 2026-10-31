import { z } from 'zod';
import { emailSchema, phoneSchema } from './auth';
import type { RefItem } from './teacher';
import type { ScanStatus } from './uploads';

export const SCHOOL_TYPES = ['nursery', 'primary', 'secondary', 'combined', 'tertiary', 'tutorial_centre'] as const;
export const SCHOOL_OWNERSHIPS = ['private', 'public', 'mission'] as const;
export const CURRICULA = ['nigerian', 'british', 'american', 'ib', 'montessori'] as const;
export const POPULATION_BANDS = ['under_100', 'from_100_to_299', 'from_300_to_599', 'from_600_to_999', 'over_1000'] as const;
export const CONTACT_TITLES = ['director', 'proprietor', 'principal', 'head_teacher', 'hr'] as const;
export const MEMBER_ROLES = ['owner', 'recruiter'] as const;

export type SchoolType = (typeof SCHOOL_TYPES)[number];
export type SchoolOwnership = (typeof SCHOOL_OWNERSHIPS)[number];
export type Curriculum = (typeof CURRICULA)[number];
export type PopulationBand = (typeof POPULATION_BANDS)[number];
export type ContactTitle = (typeof CONTACT_TITLES)[number];
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const SCHOOL_TYPE_LABELS: Record<SchoolType, string> = {
  nursery: 'Nursery',
  primary: 'Primary',
  secondary: 'Secondary',
  combined: 'Combined (nursery to secondary)',
  tertiary: 'Tertiary',
  tutorial_centre: 'Tutorial centre',
};
export const OWNERSHIP_LABELS: Record<SchoolOwnership, string> = { private: 'Private', public: 'Public', mission: 'Mission' };
export const CURRICULUM_LABELS: Record<Curriculum, string> = {
  nigerian: 'Nigerian',
  british: 'British',
  american: 'American',
  ib: 'IB',
  montessori: 'Montessori',
};
export const POPULATION_BAND_LABELS: Record<PopulationBand, string> = {
  under_100: 'Under 100 students',
  from_100_to_299: '100–299 students',
  from_300_to_599: '300–599 students',
  from_600_to_999: '600–999 students',
  over_1000: '1,000+ students',
};
export const CONTACT_TITLE_LABELS: Record<ContactTitle, string> = {
  director: 'Director',
  proprietor: 'Proprietor',
  principal: 'Principal',
  head_teacher: 'Head Teacher',
  hr: 'HR',
};
export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = { owner: 'Owner', recruiter: 'Recruiter' };

/** Days a team invite link stays valid (confirmed 2026-10-31). */
export const SCHOOL_INVITE_TTL_DAYS = 7;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Accepts "greenfield.edu.ng" as well as a full URL; stored with https://. */
const websiteSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : undefined))
  .pipe(z.url('Enter a valid website address').max(200).optional());

// ───────────── FR-3 step 1: school details ─────────────

const detailsFields = {
  name: z.string().trim().min(2, 'Enter the school name').max(150, 'Name is too long'),
  type: z.enum(SCHOOL_TYPES, 'Choose the school type'),
  ownership: z.enum(SCHOOL_OWNERSHIPS, 'Choose the ownership'),
  curriculum: z.array(z.enum(CURRICULA)).min(1, 'Choose at least one curriculum'),
  populationBand: z.enum(POPULATION_BANDS).nullish(),
  website: websiteSchema,
  description: optionalText(2000),
};

/** POST /schools */
export const createSchoolSchema = z.object(detailsFields);
export type CreateSchoolInput = z.input<typeof createSchoolSchema>;

// ───────────── step 3: contact person ─────────────

const contactFields = {
  contactName: z.string().trim().min(2, 'Enter the contact person’s name').max(120),
  contactTitle: z.enum(CONTACT_TITLES, 'Choose a title'),
  contactPhone: phoneSchema,
  contactEmail: emailSchema,
};
export const contactSchema = z.object(contactFields);
export type ContactInput = z.input<typeof contactSchema>;

/** PATCH /schools/me: any school detail and/or the contact person. */
export const updateSchoolSchema = z
  .object({ ...detailsFields, ...contactFields })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update');
export type UpdateSchoolInput = z.input<typeof updateSchoolSchema>;

// ───────────── step 2: location (full address required, FR-3) ─────────────

export const schoolLocationSchema = z
  .object({
    countryCode: z.literal('NG').default('NG'),
    stateId: z.uuid('Choose a state'),
    lgaId: z.uuid('Choose an LGA or city'),
    area: optionalText(120),
    addressLine: z.string().trim().min(5, 'Enter the school’s full address').max(200),
    lat: z.number().min(-90).max(90).nullish(),
    lng: z.number().min(-180).max(180).nullish(),
  })
  .refine((v) => (v.lat == null) === (v.lng == null), { message: 'Map pin needs both latitude and longitude', path: ['lat'] });
export type SchoolLocationInput = z.input<typeof schoolLocationSchema>;

// ───────────── step 5: team ─────────────

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(MEMBER_ROLES).default('recruiter'),
});
export type InviteMemberInput = z.input<typeof inviteMemberSchema>;

export const memberRoleSchema = z.object({ role: z.enum(MEMBER_ROLES) });

// ───────────── responses ─────────────

export interface SchoolResponse {
  id: string;
  name: string;
  slug: string;
  type: SchoolType;
  ownership: SchoolOwnership;
  curriculum: Curriculum[];
  populationBand: PopulationBand | null;
  website: string | null;
  description: string | null;
  logoUrl: string | null;
  location: {
    countryCode: string | null;
    state: RefItem | null;
    lga: RefItem | null;
    area: string | null;
    addressLine: string | null;
    lat: number | null;
    lng: number | null;
  };
  contact: {
    name: string | null;
    title: ContactTitle | null;
    phone: string | null;
    email: string | null;
  };
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  /** The signed-in user's role in this school. */
  myRole: MemberRole;
}

export interface MemberResponse {
  userId: string;
  email: string | null;
  phone: string | null;
  role: MemberRole;
  joinedAt: string;
  isMe: boolean;
}

export interface SchoolInviteResponse {
  id: string;
  email: string;
  role: MemberRole;
  expiresAt: string;
  createdAt: string;
}

export interface MembersResponse {
  data: MemberResponse[];
  /** Pending invites (owners only; empty for recruiters). */
  invites: SchoolInviteResponse[];
}

/** GET /schools/invites/:token: what the join page shows before accepting. */
export interface InvitePreviewResponse {
  schoolName: string;
  email: string;
  role: MemberRole;
  expiresAt: string;
  /** Whether an account with this email already exists (sign in instead of sign up). */
  hasAccount: boolean;
}

export interface LogoUploadResponse {
  scanStatus: ScanStatus;
  logoUrl: string | null;
}
