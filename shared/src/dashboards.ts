import { z } from 'zod';
import type { ApplicationStatus } from './applications';
import type { TeacherListItem, VacancyListItem } from './search';

/** "X principals/directors viewed your CV this week" counts the last 7 days. */
export const PROFILE_VIEWS_WINDOW_DAYS = 7;
/** Items shown in the dashboard's recommendation strip. */
export const DASHBOARD_RECOMMENDED = 3;

/** Reminders (FR-9, confirmed 2026-11-01). */
export const VACANCY_EXPIRY_REMINDER_DAYS = 3;
export const PROFILE_REMINDER = { firstAfterDays: 3, everyDays: 7, max: 3 } as const;

/** DELETE /me: the account is hidden now and erased after this many days; signing in cancels. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

export const PROFILE_VIEW_KINDS = ['profile', 'cv_view', 'cv_download'] as const;
export type ProfileViewKind = (typeof PROFILE_VIEW_KINDS)[number];
export const PROFILE_VIEW_KIND_LABELS: Record<ProfileViewKind, string> = {
  profile: 'viewed your profile',
  cv_view: 'opened your CV',
  cv_download: 'downloaded your CV',
};

export const profileViewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** GET /teachers/me/profile-views. Viewers are shown by role only (they have no public profile). */
export interface ProfileViewItem {
  id: string;
  kind: ProfileViewKind;
  viewerRole: 'principal' | 'director' | 'deleted';
  createdAt: string;
}

export interface ProfileViewsSummary {
  days: number;
  /** Different principals/directors who opened the profile or CV. */
  viewers: number;
  /** Different principals/directors who opened or downloaded the CV. */
  cvViewers: number;
}

/** GET /teachers/me/dashboard (FR-10). */
export interface TeacherDashboard {
  completeness: { score: number; canPublish: boolean };
  isPublished: boolean;
  applications: { total: number; byStatus: Record<ApplicationStatus, number> };
  invitations: { pending: number };
  interviews: { upcoming: number };
  views: ProfileViewsSummary;
  savedJobs: number;
  recommended: VacancyListItem[];
}

export interface HiringDashboardVacancy {
  id: string;
  title: string;
  status: 'published' | 'paused';
  deadline: string | null;
  applicants: number;
  /** Applications nobody has opened yet. */
  unviewed: number;
}

/** GET /hiring/dashboard (FR-10, the PRD's /schools/me/dashboard). */
export interface HiringDashboard {
  vacancies: { live: number; paused: number; drafts: number };
  open: HiringDashboardVacancy[];
  pipeline: Record<ApplicationStatus, number>;
  invitations: { pending: number };
  interviews: { upcoming: number };
  /** Best matches for the newest live vacancy. */
  recommended: { vacancyId: string; vacancyTitle: string; teachers: TeacherListItem[] } | null;
}

/** DELETE /me response. */
export interface DeletionScheduled {
  deletionScheduledFor: string;
}
