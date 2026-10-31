import { z } from 'zod';
import type { SalaryPeriod, ScreeningQuestion } from './vacancy';

export const INVITATION_STATUSES = ['pending', 'accepted', 'declined', 'expired', 'cancelled'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: 'Waiting for reply',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

/** Confirmed 2026-10-31: at most this many invitations per principal/director per day. */
export const MAX_INVITATIONS_PER_DAY = 50;
/** A pending invitation lapses after this many days (or when the vacancy closes or its deadline passes). */
export const INVITATION_EXPIRY_DAYS = 14;

/** POST /invitations */
export const createInvitationSchema = z.object({
  vacancyId: z.uuid(),
  /** The teacher profile id (as in teacher search results). */
  teacherId: z.uuid(),
  message: z
    .string()
    .trim()
    .max(1000, 'Keep the message under 1,000 characters')
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type CreateInvitationInput = z.input<typeof createInvitationSchema>;

export const invitationsQuerySchema = z.object({
  status: z.enum(INVITATION_STATUSES).optional(),
  vacancyId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** GET /invitations/me (teacher). An invitation reveals an anonymous vacancy's school. */
export interface ReceivedInvitation {
  id: string;
  status: InvitationStatus;
  message: string | null;
  invitedAt: string;
  expiresAt: string | null;
  respondedAt: string | null;
  applicationId: string | null;
  vacancy: {
    id: string;
    title: string;
    schoolLabel: string;
    state: string;
    lga: string;
    salaryMin: number;
    salaryMax: number;
    salaryPeriod: SalaryPeriod;
    screeningQuestions: ScreeningQuestion[];
  };
}

/** GET /invitations/sent (principal/director; replaces the PRD's /schools/me/invitations). */
export interface SentInvitation {
  id: string;
  status: InvitationStatus;
  message: string | null;
  invitedAt: string;
  respondedAt: string | null;
  applicationId: string | null;
  vacancy: { id: string; title: string };
  teacher: { id: string; fullName: string | null };
}
