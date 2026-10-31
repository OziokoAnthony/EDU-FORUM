import { z } from 'zod';
import type { UserRole } from './auth';

// ───────────── reports (any signed-in user) ─────────────

export const REPORT_TARGETS = ['teacher_profile', 'vacancy', 'message'] as const;
export const REPORT_REASONS = ['scam_or_fraud', 'fake_or_misleading', 'inappropriate', 'spam', 'discrimination', 'other'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  scam_or_fraud: 'Scam or fraud (e.g. asks for money)',
  fake_or_misleading: 'Fake or misleading',
  inappropriate: 'Inappropriate or offensive',
  spam: 'Spam',
  discrimination: 'Discrimination',
  other: 'Something else',
};

/** POST /reports */
export const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.uuid(),
  reason: z.enum(REPORT_REASONS, 'Choose a reason'),
  details: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type ReportInput = z.input<typeof reportSchema>;

// ───────────── admin ─────────────

const page = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};
const reason = z.string().trim().min(3, 'Give a reason').max(500);

export const adminUsersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(['teacher', 'principal', 'director', 'admin']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  ...page,
});
export const adminVacanciesQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['draft', 'published', 'paused', 'closed']).optional(),
  takenDown: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  ...page,
});
export const adminTeachersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  published: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  hidden: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  ...page,
});
export const adminReportsQuerySchema = z.object({
  status: z.enum(['open', 'resolved', 'dismissed']).default('open'),
  targetType: z.enum(REPORT_TARGETS).optional(),
  ...page,
});
export const auditQuerySchema = z.object({
  action: z.string().trim().max(80).optional(),
  actorId: z.uuid().optional(),
  targetId: z.string().trim().max(80).optional(),
  ...page,
});

export const reasonSchema = z.object({ reason });
export const resolveReportSchema = z.object({
  status: z.enum(['resolved', 'dismissed']),
  resolution: z.string().trim().min(3, 'Say what you did').max(500),
});

/** Reference lists admins manage (PRD: subjects, levels, qualifications, certifications, LGAs). */
export const META_TYPES = ['subjects', 'levels', 'qualification-types', 'certification-types', 'lgas'] as const;
export type MetaType = (typeof META_TYPES)[number];
export const metaItemSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(120),
  /** Ordering in lists (subjects, levels) or rank (qualifications: higher = more advanced). */
  sortOrder: z.number().int().min(0).max(1000).optional(),
  rank: z.number().int().min(0).max(1000).optional(),
  issuer: z.string().trim().max(150).optional(),
  /** LGAs only: the state they belong to. */
  stateId: z.uuid().optional(),
  isActive: z.boolean().optional(),
});
export const metaItemUpdateSchema = metaItemSchema.partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export interface AdminStats {
  users: { teachers: number; principals: number; directors: number; suspended: number; newThisWeek: number };
  teachers: { published: number; withCv: number; hiddenByAdmin: number };
  vacancies: { live: number; closed: number; takenDown: number; postedThisWeek: number };
  applications: { total: number; thisWeek: number; hired: number };
  reports: { open: number };
}

export interface AdminUserItem {
  id: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  status: 'active' | 'suspended';
  suspendedReason: string | null;
  verified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /** Teacher's name, if they have a profile. */
  name: string | null;
}

export interface AdminUserDetail extends AdminUserItem {
  deletionRequestedAt: string | null;
  teacherProfile: { id: string; isPublished: boolean; moderationNote: string | null; completenessScore: number } | null;
  vacancies: { total: number; live: number };
  applications: number;
  reportsAgainst: number;
}

export interface AdminVacancyItem {
  id: string;
  title: string;
  schoolName: string | null;
  isAnonymous: boolean;
  status: 'draft' | 'published' | 'paused' | 'closed';
  takedownReason: string | null;
  state: string;
  lga: string;
  poster: { id: string; email: string | null; role: UserRole };
  applicants: number;
  publishedAt: string | null;
  createdAt: string;
}

export interface AdminTeacherItem {
  id: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  state: string | null;
  lga: string | null;
  isPublished: boolean;
  moderationNote: string | null;
  completenessScore: number;
  updatedAt: string;
}

export interface AdminReportItem {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  /** Human label for the target, e.g. the vacancy title or teacher name. */
  targetLabel: string;
  reason: ReportReason;
  details: string | null;
  status: 'open' | 'resolved' | 'dismissed';
  resolution: string | null;
  reporter: { id: string; email: string | null; role: UserRole };
  /** Open reports on the same target, including this one. */
  openOnTarget: number;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AuditLogItem {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  actor: { id: string; email: string | null; role: UserRole } | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
