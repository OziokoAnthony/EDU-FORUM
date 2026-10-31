import { z } from 'zod';

export const INTERVIEW_MODES = ['in_person', 'phone', 'video'] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];
export const INTERVIEW_STATUSES = ['proposed', 'confirmed', 'rescheduled', 'cancelled', 'done'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];
/** Interviews that are still going ahead. */
export const ACTIVE_INTERVIEW_STATUSES: InterviewStatus[] = ['proposed', 'confirmed', 'rescheduled'];

export const INTERVIEW_MODE_LABELS: Record<InterviewMode, string> = { in_person: 'In person', phone: 'Phone call', video: 'Video call' };
export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  proposed: 'Waiting for teacher',
  confirmed: 'Confirmed',
  rescheduled: 'New time, waiting for teacher',
  cancelled: 'Cancelled',
  done: 'Done',
};
/** What "where" means for each mode (form label). */
export const INTERVIEW_WHERE_LABELS: Record<InterviewMode, string> = {
  in_person: 'Address',
  phone: 'Phone number to call',
  video: 'Video link (Google Meet, Zoom…)',
};

/** Confirmed 2026-10-31: both sides get a reminder this long before the interview. */
export const INTERVIEW_REMINDER_HOURS = 24;

const future = (message: string) =>
  z.iso.datetime({ offset: true, message: 'Pick a date and time' }).refine((v) => new Date(v).getTime() > Date.now(), message);

const interviewFields = z.object({
  scheduledAt: future('Pick a time in the future'),
  durationMinutes: z.number().int().min(10, 'At least 10 minutes').max(480, 'At most 8 hours').optional(),
  mode: z.enum(INTERVIEW_MODES),
  locationOrLink: z.string().trim().min(3, 'Say where the interview is').max(500),
  notes: z
    .string()
    .trim()
    .max(1000, 'Keep notes under 1,000 characters')
    .optional()
    .transform((v) => (v ? v : undefined)),
});

const videoNeedsLink = (v: { mode?: InterviewMode; locationOrLink?: string }) => v.mode !== 'video' || v.locationOrLink === undefined || /^https?:\/\/\S+$/i.test(v.locationOrLink);
const linkIssue = { message: 'Paste the full video link, starting with https://', path: ['locationOrLink'] };

/** POST /applications/:id/interviews */
export const scheduleInterviewSchema = interviewFields.refine(videoNeedsLink, linkIssue);
export type ScheduleInterviewInput = z.input<typeof scheduleInterviewSchema>;

/** PATCH /interviews/:id (reschedule or update details). */
export const updateInterviewSchema = interviewFields.partial().refine(videoNeedsLink, linkIssue);

/** POST /interviews/:id/propose (teacher suggests another time). */
export const proposeInterviewSchema = z.object({
  proposedAt: future('Pick a time in the future'),
  note: z.string().trim().max(500).optional().transform((v) => (v ? v : undefined)),
});

/** POST /interviews/:id/cancel */
export const cancelInterviewSchema = z.object({
  reason: z.string().trim().max(500).optional().transform((v) => (v ? v : undefined)),
});

export const interviewsQuerySchema = z.object({
  /** Past and finished interviews instead of upcoming ones. */
  past: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export interface InterviewItem {
  id: string;
  applicationId: string;
  scheduledAt: string;
  durationMinutes: number | null;
  mode: InterviewMode;
  locationOrLink: string;
  status: InterviewStatus;
  notes: string | null;
  proposedAt: string | null;
  proposalNote: string | null;
  cancelReason: string | null;
  vacancy: { id: string; title: string; schoolLabel: string };
  teacher: { id: string; fullName: string | null };
}
