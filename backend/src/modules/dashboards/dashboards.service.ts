import { Injectable } from '@nestjs/common';
import {
  ACTIVE_INTERVIEW_STATUSES,
  APPLICATION_STATUSES,
  DASHBOARD_RECOMMENDED,
  PROFILE_VIEWS_WINDOW_DAYS,
  type ApplicationStatus,
  type HiringDashboard,
  type Paginated,
  type ProfileViewItem,
  type ProfileViewsSummary,
  type profileViewsQuerySchema,
  type TeacherDashboard,
} from '@edu-forum/shared';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { fromDbDate } from '../../common/dates';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TeacherSearchService } from '../search/teacher-search.service';
import { VacancySearchService } from '../search/vacancy-search.service';
import { CompletenessService } from '../teachers/completeness.service';
import { TeacherProfilesService } from '../teachers/teacher-profiles.service';

const DAY_MS = 86_400_000;
const LIVE_VACANCY = { status: 'published', deletedAt: null, takedownReason: null } as const;

function byStatus(rows: { status: ApplicationStatus; _count: { _all: number } }[]): Record<ApplicationStatus, number> {
  const out = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;
  for (const r of rows) out[r.status] = r._count._all;
  return out;
}

/** FR-10 dashboards and the teacher's "who viewed my profile/CV" list. */
@Injectable()
export class DashboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: TeacherProfilesService,
    private readonly completeness: CompletenessService,
    private readonly vacancySearch: VacancySearchService,
    private readonly teacherSearch: TeacherSearchService,
  ) {}

  async teacher(user: AuthUser, now = new Date()): Promise<TeacherDashboard> {
    const p = await this.profiles.ensure(user.id);
    const [completeness, statuses, pendingInvites, upcoming, views, savedJobs, recommended] = await Promise.all([
      this.completeness.compute(p.id),
      this.prisma.application.groupBy({ by: ['status'], where: { teacherId: p.id, deletedAt: null }, _count: { _all: true } }),
      this.prisma.invitation.count({
        where: { teacherId: p.id, deletedAt: null, status: 'pending', expiresAt: { gt: now }, vacancy: LIVE_VACANCY },
      }),
      this.prisma.interview.count({
        where: { deletedAt: null, status: { in: ACTIVE_INTERVIEW_STATUSES }, scheduledAt: { gt: now }, application: { teacherId: p.id } },
      }),
      this.viewsSummary(p.id, now),
      this.prisma.savedItem.count({ where: { userId: user.id, itemType: 'vacancy' } }),
      this.vacancySearch.recommended(user),
    ]);
    const counts = byStatus(statuses);
    return {
      completeness: { score: completeness.score, canPublish: completeness.canPublish },
      isPublished: p.isPublished,
      applications: { total: Object.values(counts).reduce((a, b) => a + b, 0), byStatus: counts },
      invitations: { pending: pendingInvites },
      interviews: { upcoming },
      views,
      savedJobs,
      recommended: recommended.data.slice(0, DASHBOARD_RECOMMENDED),
    };
  }

  /** GET /teachers/me/profile-views — newest first; viewers appear by role only. */
  async profileViews(user: AuthUser, q: z.output<typeof profileViewsQuerySchema>): Promise<Paginated<ProfileViewItem> & { summary: ProfileViewsSummary }> {
    const p = await this.profiles.ensure(user.id);
    const where = { teacherId: p.id };
    const [rows, total, summary] = await Promise.all([
      this.prisma.profileView.findMany({
        where,
        include: { viewer: { select: { role: true, deletedAt: true, deletionRequestedAt: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.profileView.count({ where }),
      this.viewsSummary(p.id),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        viewerRole: r.viewer.deletedAt || r.viewer.deletionRequestedAt || (r.viewer.role !== 'principal' && r.viewer.role !== 'director') ? 'deleted' : r.viewer.role,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: { page: q.page, limit: q.limit, total },
      summary,
    };
  }

  /** GET /hiring/dashboard — the poster's own vacancies and applicants only. */
  async hiring(user: AuthUser, now = new Date()): Promise<HiringDashboard> {
    const mine = { createdById: user.id, deletedAt: null };
    const [statusCounts, open, pipeline, pendingInvites, upcoming] = await Promise.all([
      this.prisma.vacancy.groupBy({ by: ['status'], where: mine, _count: { _all: true } }),
      this.prisma.vacancy.findMany({
        where: { ...mine, status: { in: ['published', 'paused'] } },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          title: true,
          status: true,
          deadline: true,
          takedownReason: true,
          _count: { select: { applications: { where: { deletedAt: null } } } },
        },
      }),
      this.prisma.application.groupBy({ by: ['status'], where: { deletedAt: null, vacancy: mine }, _count: { _all: true } }),
      this.prisma.invitation.count({ where: { invitedById: user.id, deletedAt: null, status: 'pending', expiresAt: { gt: now }, vacancy: LIVE_VACANCY } }),
      this.prisma.interview.count({
        where: { deletedAt: null, status: { in: ACTIVE_INTERVIEW_STATUSES }, scheduledAt: { gt: now }, application: { vacancy: mine } },
      }),
    ]);
    const unviewed = await this.prisma.application.groupBy({
      by: ['vacancyId'],
      where: { deletedAt: null, status: 'applied', vacancyId: { in: open.map((v) => v.id) } },
      _count: { _all: true },
    });
    const unviewedBy = new Map(unviewed.map((u) => [u.vacancyId, u._count._all]));
    const count = (s: string) => statusCounts.find((c) => c.status === s)?._count._all ?? 0;

    const newestLive = open.find((v) => v.status === 'published' && !v.takedownReason);
    const recommended = newestLive
      ? {
          vacancyId: newestLive.id,
          vacancyTitle: newestLive.title,
          teachers: (await this.teacherSearch.recommendedFor(user, newestLive.id)).data.slice(0, DASHBOARD_RECOMMENDED),
        }
      : null;

    return {
      vacancies: { live: count('published'), paused: count('paused'), drafts: count('draft') },
      open: open.map((v) => ({
        id: v.id,
        title: v.title,
        status: v.status as 'published' | 'paused',
        deadline: fromDbDate(v.deadline),
        applicants: v._count.applications,
        unviewed: unviewedBy.get(v.id) ?? 0,
      })),
      pipeline: byStatus(pipeline),
      invitations: { pending: pendingInvites },
      interviews: { upcoming },
      recommended,
    };
  }

  /** Distinct principals/directors in the last 7 days (each viewer counts once). */
  private async viewsSummary(teacherId: string, now = new Date()): Promise<ProfileViewsSummary> {
    const since = new Date(now.getTime() - PROFILE_VIEWS_WINDOW_DAYS * DAY_MS);
    const recent = await this.prisma.profileView.findMany({
      where: { teacherId, createdAt: { gte: since } },
      select: { viewerId: true, kind: true },
    });
    return {
      days: PROFILE_VIEWS_WINDOW_DAYS,
      viewers: new Set(recent.map((r) => r.viewerId)).size,
      cvViewers: new Set(recent.filter((r) => r.kind !== 'profile').map((r) => r.viewerId)).size,
    };
  }
}
