import { HttpStatus, Injectable } from '@nestjs/common';
import {
  APP_NAME,
  jobPath,
  slugify,
  type AdminReportItem,
  type adminReportsQuerySchema,
  type AdminStats,
  type adminTeachersQuerySchema,
  type AdminTeacherItem,
  type AdminUserDetail,
  type AdminUserItem,
  type adminUsersQuerySchema,
  type adminVacanciesQuerySchema,
  type AdminVacancyItem,
  type auditQuerySchema,
  type AuditLogItem,
  type metaItemSchema,
  type metaItemUpdateSchema,
  type MetaType,
  type Paginated,
  type ReportReason,
  type resolveReportSchema,
} from '@edu-forum/shared';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { ApiException } from '../../common/filters/api-exception.filter';
import { Prisma, type User } from '../../generated/prisma/client';
import { AuditService } from '../../infra/audit/audit.service';
import { EmailQueue, escapeHtml } from '../../infra/mail/email-queue';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RealtimeGateway } from '../../infra/realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { SessionService } from '../auth/session.service';
import { SeoNotifier } from '../seo/seo-notifier';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const notFound = (what: string) => new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`);
const rule = (message: string) => new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', message);
const contains = (q?: string) => (q ? { contains: q, mode: 'insensitive' as const } : undefined);

/**
 * FR-11 admin and moderation (no verification queue: identity verification was dropped by
 * the user, 2026-10-31). Every change is written to the audit log.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly emails: EmailQueue,
    private readonly seo: SeoNotifier,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async stats(): Promise<AdminStats> {
    const weekAgo = new Date(Date.now() - WEEK_MS);
    const p = this.prisma;
    const [teachers, principals, directors, suspended, newThisWeek, published, withCv, hidden, live, closed, takenDown, postedThisWeek, apps, appsWeek, hired, reports] =
      await Promise.all([
        p.user.count({ where: { role: 'teacher', deletedAt: null } }),
        p.user.count({ where: { role: 'principal', deletedAt: null } }),
        p.user.count({ where: { role: 'director', deletedAt: null } }),
        p.user.count({ where: { status: 'suspended', deletedAt: null } }),
        p.user.count({ where: { createdAt: { gte: weekAgo }, deletedAt: null } }),
        p.teacherProfile.count({ where: { isPublished: true, deletedAt: null } }),
        p.teacherProfile.count({ where: { deletedAt: null, cvs: { some: { isActive: true, scanStatus: 'clean', deletedAt: null } } } }),
        p.teacherProfile.count({ where: { moderationNote: { not: null }, deletedAt: null } }),
        p.vacancy.count({ where: { status: 'published', deletedAt: null } }),
        p.vacancy.count({ where: { status: 'closed', deletedAt: null, takedownReason: null } }),
        p.vacancy.count({ where: { takedownReason: { not: null }, deletedAt: null } }),
        p.vacancy.count({ where: { publishedAt: { gte: weekAgo }, deletedAt: null } }),
        p.application.count({ where: { deletedAt: null } }),
        p.application.count({ where: { createdAt: { gte: weekAgo }, deletedAt: null } }),
        p.application.count({ where: { status: 'hired', deletedAt: null } }),
        p.report.count({ where: { status: 'open' } }),
      ]);
    return {
      users: { teachers, principals, directors, suspended, newThisWeek },
      teachers: { published, withCv, hiddenByAdmin: hidden },
      vacancies: { live, closed, takenDown, postedThisWeek },
      applications: { total: apps, thisWeek: appsWeek, hired },
      reports: { open: reports },
    };
  }

  // ───────────── users ─────────────

  async users(q: z.output<typeof adminUsersQuerySchema>): Promise<Paginated<AdminUserItem>> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      role: q.role,
      status: q.status,
      OR: q.q ? [{ email: contains(q.q) }, { phone: contains(q.q) }, { teacherProfile: { fullName: contains(q.q) } }] : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where, include: { teacherProfile: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.user.count({ where }),
    ]);
    return { data: rows.map(toUserItem), meta: { page: q.page, limit: q.limit, total } };
  }

  async user(id: string): Promise<AdminUserDetail> {
    const u = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, include: { teacherProfile: true } });
    if (!u) throw notFound('User');
    const [total, live, applications] = await Promise.all([
      this.prisma.vacancy.count({ where: { createdById: id, deletedAt: null } }),
      this.prisma.vacancy.count({ where: { createdById: id, deletedAt: null, status: 'published' } }),
      u.teacherProfile ? this.prisma.application.count({ where: { teacherId: u.teacherProfile.id, deletedAt: null } }) : 0,
    ]);
    const vacancyIds = (await this.prisma.vacancy.findMany({ where: { createdById: id }, select: { id: true } })).map((v) => v.id);
    const reportsAgainst = await this.prisma.report.count({
      where: {
        OR: [
          ...(u.teacherProfile ? [{ targetType: 'teacher_profile' as const, targetId: u.teacherProfile.id }] : []),
          { targetType: 'vacancy', targetId: { in: vacancyIds } },
        ],
      },
    });
    return {
      ...toUserItem({ ...u, teacherProfile: u.teacherProfile ? { fullName: u.teacherProfile.fullName } : null }),
      deletionRequestedAt: u.deletionRequestedAt?.toISOString() ?? null,
      teacherProfile: u.teacherProfile
        ? { id: u.teacherProfile.id, isPublished: u.teacherProfile.isPublished, moderationNote: u.teacherProfile.moderationNote, completenessScore: u.teacherProfile.completenessScore }
        : null,
      vacancies: { total, live },
      applications,
      reportsAgainst,
    };
  }

  /** Suspension takes effect on the user's next request (the guard reloads them) and signs them out. */
  async suspend(admin: AuthUser, id: string, reason: string): Promise<AdminUserDetail> {
    const u = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!u) throw notFound('User');
    if (u.id === admin.id) throw rule('You cannot suspend yourself');
    if (u.role === 'admin') throw rule('Admins cannot be suspended here');
    await this.prisma.user.update({ where: { id }, data: { status: 'suspended', suspendedReason: reason } });
    await this.sessions.revokeAllForUser(id);
    this.realtime.disconnectUser(id);
    await this.audit.log({ actorId: admin.id, action: 'user.suspend', targetType: 'user', targetId: id, metadata: { reason } });
    if (u.email) {
      await this.emails.send({
        to: u.email,
        subject: `Your ${APP_NAME} account has been suspended`,
        text: `Your ${APP_NAME} account has been suspended.\n\nReason: ${reason}\n\nIf you think this is a mistake, reply to this email.`,
        html: `<p>Your ${APP_NAME} account has been suspended.</p><p>Reason: ${escapeHtml(reason)}</p><p>If you think this is a mistake, reply to this email.</p>`,
      });
    }
    return this.user(id);
  }

  async reinstate(admin: AuthUser, id: string): Promise<AdminUserDetail> {
    const u = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!u) throw notFound('User');
    if (u.status !== 'suspended') throw rule('This user is not suspended');
    await this.prisma.user.update({ where: { id }, data: { status: 'active', suspendedReason: null } });
    await this.audit.log({ actorId: admin.id, action: 'user.reinstate', targetType: 'user', targetId: id });
    return this.user(id);
  }

  // ───────────── vacancies ─────────────

  async vacancies(q: z.output<typeof adminVacanciesQuerySchema>): Promise<Paginated<AdminVacancyItem>> {
    const where: Prisma.VacancyWhereInput = {
      deletedAt: null,
      status: q.status,
      takedownReason: q.takenDown === undefined ? undefined : q.takenDown ? { not: null } : null,
      OR: q.q ? [{ title: contains(q.q) }, { schoolName: contains(q.q) }] : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.vacancy.findMany({
        where,
        include: {
          state: { select: { name: true } },
          lga: { select: { name: true } },
          createdBy: { select: { id: true, email: true, role: true } },
          _count: { select: { applications: { where: { deletedAt: null } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.vacancy.count({ where }),
    ]);
    return {
      data: rows.map((v) => ({
        id: v.id,
        title: v.title,
        schoolName: v.schoolName,
        isAnonymous: v.locationVisibility === 'anonymous',
        status: v.status,
        takedownReason: v.takedownReason,
        state: v.state.name,
        lga: v.lga.name,
        poster: v.createdBy,
        applicants: v._count.applications,
        publishedAt: v.publishedAt?.toISOString() ?? null,
        createdAt: v.createdAt.toISOString(),
      })),
      meta: { page: q.page, limit: q.limit, total },
    };
  }

  /** Takes a vacancy off the site for good (closed as "taken_down"); the poster is emailed why. */
  async takedown(admin: AuthUser, id: string, reason: string): Promise<{ id: string; status: string; takedownReason: string }> {
    const v = await this.prisma.vacancy.findFirst({ where: { id, deletedAt: null }, include: { createdBy: { select: { email: true } } } });
    if (!v) throw notFound('Vacancy');
    if (v.takedownReason) throw rule('This vacancy has already been taken down');
    await this.prisma.vacancy.update({
      where: { id },
      data: { takedownReason: reason, status: 'closed', closedAt: v.closedAt ?? new Date(), closeReason: 'taken_down' },
    });
    await this.audit.log({ actorId: admin.id, action: 'vacancy.takedown', targetType: 'vacancy', targetId: id, metadata: { reason, title: v.title } });
    await this.seo.notify({ path: jobPath(v), shortId: v.shortId, type: 'URL_DELETED' });
    await this.notifications.notify({
      userId: v.createdById,
      type: 'moderation',
      title: `Your vacancy was removed: ${v.title}`,
      body: `Our team removed this vacancy. Reason: ${reason}`,
      link: `/hiring/vacancies/${id}`,
      alwaysEmail: true,
      email: v.createdBy.email
        ? {
            to: v.createdBy.email,
            subject: `Your vacancy was removed: ${v.title}`,
            text: `Our team removed your vacancy "${v.title}" from ${APP_NAME}.\n\nReason: ${reason}`,
            html: `<p>Our team removed your vacancy <strong>${escapeHtml(v.title)}</strong> from ${APP_NAME}.</p><p>Reason: ${escapeHtml(reason)}</p>`,
          }
        : undefined,
    });
    return { id, status: 'closed', takedownReason: reason };
  }

  // ───────────── teacher profiles ─────────────

  async teachers(q: z.output<typeof adminTeachersQuerySchema>): Promise<Paginated<AdminTeacherItem>> {
    const where: Prisma.TeacherProfileWhereInput = {
      deletedAt: null,
      isPublished: q.published,
      moderationNote: q.hidden === undefined ? undefined : q.hidden ? { not: null } : null,
      OR: q.q ? [{ fullName: contains(q.q) }, { user: { email: contains(q.q) } }] : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.teacherProfile.findMany({
        where,
        include: { user: { select: { email: true } }, state: { select: { name: true } }, lga: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.teacherProfile.count({ where }),
    ]);
    return {
      data: rows.map((t) => ({
        id: t.id,
        userId: t.userId,
        fullName: t.fullName,
        email: t.user.email,
        state: t.state?.name ?? null,
        lga: t.lga?.name ?? null,
        isPublished: t.isPublished,
        moderationNote: t.moderationNote,
        completenessScore: t.completenessScore,
        updatedAt: t.updatedAt.toISOString(),
      })),
      meta: { page: q.page, limit: q.limit, total },
    };
  }

  /** Hides a profile; the teacher cannot republish until an admin restores it. */
  async unpublishTeacher(admin: AuthUser, id: string, reason: string) {
    const t = await this.prisma.teacherProfile.findFirst({ where: { id, deletedAt: null }, include: { user: { select: { email: true } } } });
    if (!t) throw notFound('Teacher profile');
    await this.prisma.teacherProfile.update({ where: { id }, data: { isPublished: false, moderationNote: reason } });
    await this.audit.log({ actorId: admin.id, action: 'teacher.unpublish', targetType: 'teacher_profile', targetId: id, metadata: { reason } });
    await this.notifications.notify({
      userId: t.userId,
      type: 'moderation',
      title: 'Your profile was hidden',
      body: `Our team hid your teacher profile from principals and directors. Reason: ${reason}`,
      link: '/teacher',
      alwaysEmail: true,
      email: t.user.email
        ? {
            to: t.user.email,
            subject: `Your ${APP_NAME} profile was hidden`,
            text: `Our team hid your teacher profile from principals and directors.\n\nReason: ${reason}\n\nReply to this email if you would like us to review it.`,
            html: `<p>Our team hid your teacher profile from principals and directors.</p><p>Reason: ${escapeHtml(reason)}</p><p>Reply to this email if you would like us to review it.</p>`,
          }
        : undefined,
    });
    return { id, isPublished: false, moderationNote: reason };
  }

  /** Lifts an admin hide; the teacher publishes again themselves. */
  async restoreTeacher(admin: AuthUser, id: string) {
    const t = await this.prisma.teacherProfile.findFirst({ where: { id, deletedAt: null } });
    if (!t) throw notFound('Teacher profile');
    if (!t.moderationNote) throw rule('This profile is not hidden by an admin');
    await this.prisma.teacherProfile.update({ where: { id }, data: { moderationNote: null } });
    await this.audit.log({ actorId: admin.id, action: 'teacher.restore', targetType: 'teacher_profile', targetId: id });
    return { id, isPublished: t.isPublished, moderationNote: null };
  }

  // ───────────── reports ─────────────

  async reports(q: z.output<typeof adminReportsQuerySchema>): Promise<Paginated<AdminReportItem>> {
    const where: Prisma.ReportWhereInput = { status: q.status, targetType: q.targetType };
    const [rows, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: { reporter: { select: { id: true, email: true, role: true } } },
        orderBy: { createdAt: q.status === 'open' ? 'asc' : 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.report.count({ where }),
    ]);
    const data = await Promise.all(
      rows.map(async (r): Promise<AdminReportItem> => ({
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        targetLabel: await this.targetLabel(r.targetType, r.targetId),
        reason: r.reason as ReportReason,
        details: r.details,
        status: r.status,
        resolution: r.resolution,
        reporter: r.reporter,
        openOnTarget: await this.prisma.report.count({ where: { targetType: r.targetType, targetId: r.targetId, status: 'open' } }),
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
      })),
    );
    return { data, meta: { page: q.page, limit: q.limit, total } };
  }

  async resolveReport(admin: AuthUser, id: string, input: z.output<typeof resolveReportSchema>) {
    const r = await this.prisma.report.findUnique({ where: { id } });
    if (!r) throw notFound('Report');
    if (r.status !== 'open') throw rule('This report is already closed');
    await this.prisma.report.update({
      where: { id },
      data: { status: input.status, resolution: input.resolution, resolvedById: admin.id, resolvedAt: new Date() },
    });
    await this.audit.log({ actorId: admin.id, action: `report.${input.status}`, targetType: 'report', targetId: id, metadata: { resolution: input.resolution } });
    return { id, status: input.status, resolution: input.resolution };
  }

  private async targetLabel(type: AdminReportItem['targetType'], id: string): Promise<string> {
    if (type === 'vacancy') return (await this.prisma.vacancy.findUnique({ where: { id }, select: { title: true } }))?.title ?? 'Deleted vacancy';
    if (type === 'teacher_profile') return (await this.prisma.teacherProfile.findUnique({ where: { id }, select: { fullName: true } }))?.fullName ?? 'Teacher profile';
    const m = await this.prisma.message.findUnique({ where: { id }, select: { body: true } });
    return m?.body ? m.body.slice(0, 80) : 'Message';
  }

  // ───────────── reference data ─────────────

  /** All items of a list, including deactivated ones (the public /meta lists show active only). */
  async listMeta(type: MetaType) {
    const order = { name: 'asc' as const };
    const data = await {
      subjects: () => this.prisma.subject.findMany({ orderBy: [{ sortOrder: 'asc' }, order] }),
      levels: () => this.prisma.level.findMany({ orderBy: [{ sortOrder: 'asc' }, order] }),
      'qualification-types': () => this.prisma.qualificationType.findMany({ orderBy: [{ rank: 'asc' }, order] }),
      'certification-types': () => this.prisma.certificationType.findMany({ orderBy: order }),
      lgas: () => this.prisma.lga.findMany({ orderBy: [{ state: { name: 'asc' } }, order], include: { state: { select: { name: true } } } }),
    }[type]();
    return { data };
  }

  /** "Remove" deactivates the item: it disappears from choices but existing records keep it. */
  async createMeta(admin: AuthUser, type: MetaType, input: z.output<typeof metaItemSchema>) {
    const slug = slugify(input.name);
    if (!slug) throw rule('That name cannot be used');
    try {
      const item = await this.metaCreate(type, slug, input);
      await this.audit.log({ actorId: admin.id, action: 'meta.create', targetType: type, targetId: item.id, metadata: { name: input.name } });
      return item;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiException(HttpStatus.CONFLICT, 'CONFLICT', 'An item with this name already exists');
      }
      throw err;
    }
  }

  /** The slug never changes on edit: teacher profiles and vacancies store it. */
  async updateMeta(admin: AuthUser, type: MetaType, id: string, input: z.output<typeof metaItemUpdateSchema>, action = 'meta.update') {
    const data = { name: input.name, isActive: input.isActive };
    let item: { id: string };
    try {
      item = await {
        subjects: () => this.prisma.subject.update({ where: { id }, data: { ...data, sortOrder: input.sortOrder } }),
        levels: () => this.prisma.level.update({ where: { id }, data: { ...data, sortOrder: input.sortOrder } }),
        'qualification-types': () => this.prisma.qualificationType.update({ where: { id }, data: { ...data, rank: input.rank } }),
        'certification-types': () => this.prisma.certificationType.update({ where: { id }, data: { ...data, issuer: input.issuer } }),
        lgas: () => this.prisma.lga.update({ where: { id }, data }),
      }[type]();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') throw notFound('Item');
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ApiException(HttpStatus.CONFLICT, 'CONFLICT', 'An item with this name already exists');
      throw err;
    }
    await this.audit.log({ actorId: admin.id, action, targetType: type, targetId: id, metadata: input as Record<string, unknown> });
    return item;
  }

  async removeMeta(admin: AuthUser, type: MetaType, id: string): Promise<void> {
    await this.updateMeta(admin, type, id, { isActive: false }, 'meta.remove');
  }

  private metaCreate(type: MetaType, slug: string, input: z.output<typeof metaItemSchema>) {
    const base = { name: input.name, slug, isActive: input.isActive ?? true };
    switch (type) {
      case 'subjects':
        return this.prisma.subject.create({ data: { ...base, sortOrder: input.sortOrder ?? 0 } });
      case 'levels':
        return this.prisma.level.create({ data: { ...base, sortOrder: input.sortOrder ?? 0 } });
      case 'qualification-types':
        return this.prisma.qualificationType.create({ data: { ...base, rank: input.rank ?? 0 } });
      case 'certification-types':
        return this.prisma.certificationType.create({ data: { ...base, issuer: input.issuer ?? null } });
      case 'lgas':
        if (!input.stateId) throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Validation failed', { issues: [{ path: 'stateId', message: 'Choose the state' }] });
        return this.prisma.lga.create({ data: { ...base, stateId: input.stateId } });
    }
  }

  // ───────────── audit log ─────────────

  async auditLogs(q: z.output<typeof auditQuerySchema>): Promise<Paginated<AuditLogItem>> {
    const where: Prisma.AuditLogWhereInput = { action: q.action ? { startsWith: q.action } : undefined, actorId: q.actorId, targetId: q.targetId };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        actor: r.actor,
        metadata: r.metadata as Record<string, unknown>,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: { page: q.page, limit: q.limit, total },
    };
  }
}

function toUserItem(u: User & { teacherProfile: { fullName: string | null } | null }): AdminUserItem {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    suspendedReason: u.suspendedReason,
    verified: !!(u.emailVerifiedAt || u.phoneVerifiedAt),
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    name: u.teacherProfile?.fullName ?? null,
  };
}
