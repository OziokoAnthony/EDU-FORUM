import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  APPLICATION_STATUS_LABELS,
  canMove,
  jobPath,
  type ApplicantDetailResponse,
  type ApplicantResponse,
  type applicantsQuerySchema,
  type ApplicationStatus,
  type applySchema,
  type BulkStatusResponse,
  type bulkStatusSchema,
  type CvLinkResponse,
  type HistoryEntry,
  type MoveStatusResponse,
  type MyApplicationResponse,
  type myApplicationsQuerySchema,
  type moveStatusSchema,
  type Paginated,
  type ScreeningAnswer,
  type ScreeningQuestion,
} from '@edu-forum/shared';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { ApiException } from '../../common/filters/api-exception.filter';
import { Prisma, type Application, type ApplicationStatusHistory, type User, type Vacancy } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TeacherSearchService } from '../search/teacher-search.service';
import { VacancySearchService } from '../search/vacancy-search.service';
import { cvViewKey } from '../teachers/teacher.mapper';
import { UploadsService } from '../uploads/uploads.service';
import { toVacancyResponse, VACANCY_INCLUDE } from '../vacancies/vacancy.serializer';
import { SeoNotifier } from '../seo/seo-notifier';
import { NotificationsService } from '../notifications/notifications.service';
import { applicationEmails } from './application-emails';

const notFound = () => new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Application not found');
const rule = (message: string) => new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', message);
/** Statuses at which an anonymous vacancy's school is revealed to the teacher. */
const REVEALING: ApplicationStatus[] = ['shortlisted', 'interview', 'offered', 'hired'];
const ROLE_LABEL: Record<User['role'], string> = { teacher: 'Teacher', principal: 'Principal', director: 'Director', admin: 'Admin' };

type HistoryRow = ApplicationStatusHistory & { changedBy: Pick<User, 'role'> };

/**
 * FR-7 applications: a published teacher applies once per vacancy with a frozen copy of
 * their CV; the vacancy's poster moves them through the pipeline. Every status change is
 * recorded in ApplicationStatusHistory and emailed to the teacher.
 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    private readonly scores: VacancySearchService,
    private readonly teachers: TeacherSearchService,
    private readonly seo: SeoNotifier,
  ) {}

  // ───────────── teacher side ─────────────

  /**
   * `invitationId`: accepting an invitation applies the same way (screening questions and CV
   * snapshot included), marks the invitation accepted in the same transaction, and tells the
   * poster "accepted your invitation" instead of "new application".
   */
  async apply(user: AuthUser, vacancyId: string, input: z.output<typeof applySchema>, opts: { invitationId?: string } = {}): Promise<MyApplicationResponse> {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      include: { cvs: { where: { isActive: true, scanStatus: 'clean', deletedAt: null }, take: 1 } },
    });
    // Confirmed 2026-10-31: only teachers with a published (complete) profile can apply.
    if (!teacher?.isPublished) throw rule('Publish your profile before applying');
    const cv = teacher.cvs[0];
    if (!cv) throw rule('Upload a CV before applying');

    const vacancy = await this.prisma.vacancy.findFirst({ where: { id: vacancyId, deletedAt: null, takedownReason: null, createdBy: { status: 'active' } } });
    const today = new Date().toISOString().slice(0, 10);
    if (!vacancy || vacancy.status !== 'published' || (vacancy.deadline && vacancy.deadline.toISOString().slice(0, 10) < today)) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'This vacancy is not open for applications');
    }
    const answers = this.checkAnswers(vacancy, input.screeningAnswers);
    const existing = await this.prisma.application.findUnique({ where: { vacancyId_teacherId: { vacancyId, teacherId: teacher.id } } });
    if (existing) throw new ApiException(HttpStatus.CONFLICT, 'CONFLICT', 'You have already applied for this vacancy');

    // Snapshot: a copy of the CV files, so replacing or purging the CV never changes what was sent.
    const snapshotId = randomUUID();
    const ext = (key: string) => key.slice(key.lastIndexOf('.'));
    const objectKey = `cv-snapshots/${snapshotId}/cv${ext(cv.objectKey)}`;
    const pdfKey = cv.pdfKey ? `cv-snapshots/${snapshotId}/view.pdf` : null;
    await this.uploads.copyObject(cv.objectKey, objectKey);
    if (cv.pdfKey && pdfKey) await this.uploads.copyObject(cv.pdfKey, pdfKey);
    const matchScore = await this.scores.scoreFor(user.id, vacancyId);

    let application: Application;
    try {
      application = await this.prisma.$transaction(async (tx) => {
        await tx.cvSnapshot.create({
          data: { id: snapshotId, sourceCvId: cv.id, objectKey, pdfKey, fileName: cv.fileName, mimeType: cv.mimeType, sizeBytes: cv.sizeBytes },
        });
        const created = await tx.application.create({
          data: {
            vacancyId,
            teacherId: teacher.id,
            cvSnapshotId: snapshotId,
            coverNote: input.coverNote ?? null,
            screeningAnswers: answers as unknown as Prisma.InputJsonValue,
            matchScore,
            source: opts.invitationId ? 'invited' : 'applied',
          },
        });
        await tx.applicationStatusHistory.create({ data: { applicationId: created.id, toStatus: 'applied', changedById: user.id } });
        if (opts.invitationId) {
          // Guarded on "pending" so a cancel racing the accept cannot both win.
          const { count } = await tx.invitation.updateMany({
            where: { id: opts.invitationId, status: 'pending' },
            data: { status: 'accepted', applicationId: created.id, respondedAt: new Date() },
          });
          if (count === 0) throw rule('This invitation is no longer open');
        } else {
          // Applying directly answers any open invitation to the same vacancy.
          await tx.invitation.updateMany({
            where: { vacancyId, teacherId: teacher.id, status: 'pending' },
            data: { status: 'accepted', applicationId: created.id, respondedAt: new Date() },
          });
        }
        return created;
      });
    } catch (err) {
      await this.uploads.deleteObject(objectKey).catch(() => undefined);
      if (pdfKey) await this.uploads.deleteObject(pdfKey).catch(() => undefined);
      // The unique index wins a race between two parallel applies.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiException(HttpStatus.CONFLICT, 'CONFLICT', 'You have already applied for this vacancy');
      }
      throw err;
    }

    const poster = await this.prisma.user.findUniqueOrThrow({ where: { id: vacancy.createdById } });
    const teacherName = teacher.fullName ?? 'A teacher';
    if (opts.invitationId) {
      await this.notifications.notify({
        userId: poster.id,
        type: 'invitation_reply',
        title: `Invitation accepted: ${vacancy.title}`,
        body: `${teacherName} accepted your invitation and applied for ${vacancy.title}.`,
        link: `/hiring/applications/${application.id}`,
        email: poster.email
          ? applicationEmails.invitationAccepted(poster.email, this.appUrl(), { vacancyTitle: vacancy.title, applicationId: application.id, teacherName })
          : undefined,
      });
      return this.getForTeacher(user, application.id);
    }
    await this.notifications.notify({
      userId: poster.id,
      type: 'new_application',
      title: `New application: ${vacancy.title}`,
      body: `${teacherName} applied for ${vacancy.title}.`,
      link: `/hiring/vacancies/${vacancyId}/applicants`,
      email: poster.email ? applicationEmails.newApplication(poster.email, this.appUrl(), { vacancyTitle: vacancy.title, vacancyId, teacherName }) : undefined,
    });
    return this.getForTeacher(user, application.id);
  }

  async listMine(user: AuthUser, q: z.output<typeof myApplicationsQuerySchema>): Promise<Paginated<MyApplicationResponse>> {
    const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!teacher) return { data: [], meta: { page: q.page, limit: q.limit, total: 0 } };
    const where: Prisma.ApplicationWhereInput = { teacherId: teacher.id, deletedAt: null, status: q.status };
    const [rows, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: { id: true },
      }),
      this.prisma.application.count({ where }),
    ]);
    return { data: await Promise.all(rows.map((r) => this.getForTeacher(user, r.id))), meta: { page: q.page, limit: q.limit, total } };
  }

  async getForTeacher(user: AuthUser, id: string): Promise<MyApplicationResponse> {
    const a = await this.prisma.application.findFirst({
      where: { id, deletedAt: null, teacher: { userId: user.id } },
      include: {
        vacancy: { include: VACANCY_INCLUDE },
        cvSnapshot: { select: { fileName: true } },
        history: { include: { changedBy: { select: { role: true } } }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!a) throw notFound();
    const v = toVacancyResponse(a.vacancy, REVEALING.includes(a.status));
    return {
      id: a.id,
      status: a.status,
      appliedAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      coverNote: a.coverNote,
      screeningAnswers: this.answersWithQuestions(a.vacancy, a.screeningAnswers),
      cvFileName: a.cvSnapshot.fileName,
      vacancy: {
        id: v.id,
        title: v.title,
        schoolLabel: v.schoolLabel,
        isAnonymous: v.isAnonymous,
        state: v.location.state,
        lga: v.location.lga,
        salaryMin: v.salaryMin,
        salaryMax: v.salaryMax,
        salaryPeriod: v.salaryPeriod,
        status: v.status,
      },
      history: a.history.map(toHistory),
    };
  }

  async withdraw(user: AuthUser, id: string): Promise<MyApplicationResponse> {
    const a = await this.prisma.application.findFirst({
      where: { id, deletedAt: null, teacher: { userId: user.id } },
      include: { vacancy: true, teacher: { select: { fullName: true } } },
    });
    if (!a) throw notFound();
    if (!canMove(a.status, 'withdrawn')) throw rule(`An application that is ${APPLICATION_STATUS_LABELS[a.status].toLowerCase()} cannot be withdrawn`);
    await this.record(a, 'withdrawn', user.id);
    const poster = await this.prisma.user.findUniqueOrThrow({ where: { id: a.vacancy.createdById } });
    const teacherName = a.teacher.fullName ?? 'A teacher';
    await this.notifications.notify({
      userId: poster.id,
      type: 'application_withdrawn',
      title: `Application withdrawn: ${a.vacancy.title}`,
      body: `${teacherName} withdrew their application for ${a.vacancy.title}.`,
      link: `/hiring/vacancies/${a.vacancyId}/applicants`,
      email: poster.email
        ? applicationEmails.withdrawn(poster.email, this.appUrl(), { vacancyTitle: a.vacancy.title, vacancyId: a.vacancyId, teacherName })
        : undefined,
    });
    return this.getForTeacher(user, id);
  }

  // ───────────── poster side (principal / director) ─────────────

  async listForVacancy(user: AuthUser, vacancyId: string, q: z.output<typeof applicantsQuerySchema>): Promise<Paginated<ApplicantResponse>> {
    await this.ownVacancy(user, vacancyId);
    const where: Prisma.ApplicationWhereInput = { vacancyId, deletedAt: null, status: q.status, rating: q.rating };
    const orderBy: Prisma.ApplicationOrderByWithRelationInput[] = {
      match: [{ matchScore: 'desc' }, { createdAt: 'asc' }],
      newest: [{ createdAt: 'desc' }],
      rating: [{ rating: { sort: 'desc', nulls: 'last' } }, { matchScore: 'desc' }],
    }[q.sort] as Prisma.ApplicationOrderByWithRelationInput[];
    const [rows, total] = await Promise.all([
      this.prisma.application.findMany({ where, orderBy, skip: (q.page - 1) * q.limit, take: q.limit, select: { id: true } }),
      this.prisma.application.count({ where }),
    ]);
    return { data: await this.applicants(rows.map((r) => r.id)), meta: { page: q.page, limit: q.limit, total } };
  }

  /** Opening an application marks it "viewed" the first time (PRD pipeline). */
  async getForPoster(user: AuthUser, id: string): Promise<ApplicantDetailResponse> {
    const a = await this.ownApplication(user, id);
    if (a.status === 'applied') await this.record(a, 'viewed', user.id, undefined, false);
    const [applicant] = await this.applicants([id]);
    const [history, notes] = await Promise.all([
      this.prisma.applicationStatusHistory.findMany({ where: { applicationId: id }, include: { changedBy: { select: { role: true } } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.applicationNote.findMany({ where: { applicationId: id, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      ...applicant,
      history: history.map(toHistory),
      notes: notes.map((n) => ({ id: n.id, body: n.body, mine: n.authorId === user.id, at: n.createdAt.toISOString() })),
    };
  }

  async moveStatus(user: AuthUser, id: string, input: z.output<typeof moveStatusSchema>): Promise<MoveStatusResponse> {
    const a = await this.ownApplication(user, id);
    if (!canMove(a.status, input.status)) {
      throw rule(`Cannot move an application from ${APPLICATION_STATUS_LABELS[a.status]} to ${APPLICATION_STATUS_LABELS[input.status]}`);
    }
    await this.record(a, input.status, user.id, input.message);
    const hired = await this.prisma.application.count({ where: { vacancyId: a.vacancyId, status: 'hired', deletedAt: null } });
    const openingsFilled = hired >= a.vacancy.openings;
    let vacancyClosed = false;
    if (input.status === 'hired' && input.closeVacancy && a.vacancy.status !== 'closed') {
      const v = await this.prisma.vacancy.update({ where: { id: a.vacancyId }, data: { status: 'closed', closedAt: new Date(), closeReason: 'filled' } });
      await this.seo.notify({ path: jobPath(v), shortId: v.shortId, type: 'URL_DELETED' });
      vacancyClosed = true;
    }
    const [application] = await this.applicants([id]);
    return { application, openingsFilled, vacancyClosed };
  }

  /** Moves several applicants of the caller's vacancy; ones that cannot move are reported, not failed. */
  async bulkStatus(user: AuthUser, vacancyId: string, input: z.output<typeof bulkStatusSchema>): Promise<BulkStatusResponse> {
    await this.ownVacancy(user, vacancyId);
    const rows = await this.prisma.application.findMany({
      where: { id: { in: input.applicationIds }, vacancyId, deletedAt: null },
      include: { vacancy: true },
    });
    const found = new Map(rows.map((r) => [r.id, r]));
    const result: BulkStatusResponse = { updated: [], skipped: [] };
    for (const appId of input.applicationIds) {
      const a = found.get(appId);
      if (!a) result.skipped.push({ id: appId, reason: 'Not an applicant for this vacancy' });
      else if (!canMove(a.status, input.status)) result.skipped.push({ id: appId, reason: `Already ${APPLICATION_STATUS_LABELS[a.status].toLowerCase()}` });
      else {
        await this.record(a, input.status, user.id, input.message);
        result.updated.push(appId);
      }
    }
    return result;
  }

  async rate(user: AuthUser, id: string, rating: number | null): Promise<ApplicantResponse> {
    await this.ownApplication(user, id);
    await this.prisma.application.update({ where: { id }, data: { rating } });
    return (await this.applicants([id]))[0];
  }

  async notes(user: AuthUser, id: string) {
    await this.ownApplication(user, id);
    const notes = await this.prisma.applicationNote.findMany({ where: { applicationId: id, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    return { data: notes.map((n) => ({ id: n.id, body: n.body, mine: n.authorId === user.id, at: n.createdAt.toISOString() })) };
  }

  /** Private notes: only the vacancy's poster can see them; never shown to the teacher. */
  async addNote(user: AuthUser, id: string, body: string) {
    await this.ownApplication(user, id);
    const n = await this.prisma.applicationNote.create({ data: { applicationId: id, authorId: user.id, body } });
    return { id: n.id, body: n.body, mine: true, at: n.createdAt.toISOString() };
  }

  async deleteNote(user: AuthUser, id: string, noteId: string): Promise<void> {
    await this.ownApplication(user, id);
    const { count } = await this.prisma.applicationNote.updateMany({
      where: { id: noteId, applicationId: id, authorId: user.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (count === 0) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Note not found');
  }

  /** GET /applications/:id/history for the teacher (their own) or the poster. */
  async history(user: AuthUser, id: string): Promise<{ data: HistoryEntry[] }> {
    const a = await this.prisma.application.findFirst({
      where: {
        id,
        deletedAt: null,
        OR: [{ teacher: { userId: user.id } }, { vacancy: { createdById: user.id } }],
      },
      select: { id: true },
    });
    if (!a) throw notFound();
    const rows = await this.prisma.applicationStatusHistory.findMany({
      where: { applicationId: id },
      include: { changedBy: { select: { role: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { data: rows.map(toHistory) };
  }

  /** The CV exactly as it was sent (the snapshot), 10-minute link, logged. */
  async cvLink(user: AuthUser, id: string, download: boolean): Promise<CvLinkResponse> {
    const a = await this.ownApplication(user, id);
    const snap = await this.prisma.cvSnapshot.findUniqueOrThrow({ where: { id: a.cvSnapshotId } });
    const key = download ? snap.objectKey : cvViewKey(snap);
    if (!key) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'The CV preview is not available');
    const url = await this.uploads.signedUrl(key, download ? { downloadName: snap.fileName } : { contentType: 'application/pdf' });
    await this.prisma.profileView.create({ data: { teacherId: a.teacherId, viewerId: user.id, kind: download ? 'cv_download' : 'cv_view' } });
    const ttl = this.config.getOrThrow<number>('SIGNED_URL_TTL_SECONDS');
    return { url, fileName: snap.fileName, mimeType: snap.mimeType, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
  }

  /** CSV of a vacancy's applicants (FR-7.4). Fields that start with = + - @ are escaped. */
  async exportCsv(user: AuthUser, vacancyId: string): Promise<{ filename: string; csv: string }> {
    const vacancy = await this.ownVacancy(user, vacancyId);
    const rows = await this.prisma.application.findMany({
      where: { vacancyId, deletedAt: null },
      orderBy: [{ matchScore: 'desc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    const applicants = await this.applicants(rows.map((r) => r.id));
    const header = ['Name', 'Phone', 'Email', 'State', 'LGA', 'Status', 'Rating', 'Match score', 'Years of experience', 'Highest qualification', 'Subjects', 'Applied on'];
    const lines = applicants.map((a) => [
      a.teacher.fullName,
      a.teacher.phone ?? '',
      a.teacher.email ?? '',
      a.teacher.state?.name ?? '',
      a.teacher.lga?.name ?? '',
      APPLICATION_STATUS_LABELS[a.status],
      a.rating ?? '',
      a.matchScore,
      a.teacher.yearsExperience,
      a.teacher.highestQualification ?? '',
      a.teacher.subjects.join('; '),
      a.appliedAt.slice(0, 10),
    ]);
    const csv = [header, ...lines].map((cols) => cols.map(csvCell).join(',')).join('\r\n');
    return { filename: `applicants-${vacancy.slug}.csv`, csv: `﻿${csv}\r\n` };
  }

  /** Notifies applicants still in the running when a live vacancy's title or salary changes. */
  async notifyVacancyChange(before: Vacancy, after: Vacancy): Promise<void> {
    if (after.status !== 'published') return;
    const changes: string[] = [];
    if (before.title !== after.title) changes.push(`Title: ${before.title} → ${after.title}`);
    if (before.salaryMin !== after.salaryMin || before.salaryMax !== after.salaryMax || before.salaryPeriod !== after.salaryPeriod) {
      const fmt = (v: Vacancy) => `₦${v.salaryMin.toLocaleString('en-NG')}–₦${v.salaryMax.toLocaleString('en-NG')} ${v.salaryPeriod}`;
      changes.push(`Salary: ${fmt(before)} → ${fmt(after)}`);
    }
    if (changes.length === 0) return;
    const applicants = await this.prisma.application.findMany({
      where: { vacancyId: after.id, deletedAt: null, status: { notIn: ['rejected', 'withdrawn'] } },
      select: { teacher: { select: { user: { select: { id: true, email: true } } } } },
    });
    for (const a of applicants) {
      const { id, email } = a.teacher.user;
      await this.notifications.notify({
        userId: id,
        type: 'vacancy_changed',
        title: `A job you applied for was updated: ${after.title}`,
        body: changes.join('. '),
        link: '/teacher/applications',
        email: email ? applicationEmails.vacancyChanged(email, this.appUrl(), { vacancyTitle: after.title, changes }) : undefined,
      });
    }
  }

  // ───────────── helpers ─────────────

  /** Writes the change and its history row, then notifies the teacher (unless `notify` is false). */
  private async record(a: Application & { vacancy?: Vacancy }, to: ApplicationStatus, byId: string, message?: string, notify = true): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.application.update({
        where: { id: a.id },
        data: { status: to, shortlistedAt: to === 'shortlisted' && !a.shortlistedAt ? new Date() : undefined },
      }),
      this.prisma.applicationStatusHistory.create({ data: { applicationId: a.id, fromStatus: a.status, toStatus: to, changedById: byId, message: message ?? null } }),
    ]);
    if (!notify || to === 'withdrawn') return;
    const full = await this.prisma.application.findUniqueOrThrow({
      where: { id: a.id },
      include: { vacancy: { include: VACANCY_INCLUDE }, teacher: { select: { user: { select: { id: true, email: true } } } } },
    });
    const { id: userId, email } = full.teacher.user;
    // The school is named only once the status reveals it (anonymous vacancies).
    const v = toVacancyResponse(full.vacancy, REVEALING.includes(to));
    const label = APPLICATION_STATUS_LABELS[to];
    await this.notifications.notify({
      userId,
      type: 'status_change',
      title: `Your application: ${label}`,
      body: `${v.title} at ${v.schoolLabel} is now ${label.toLowerCase()}.${message ? ` Message: ${message}` : ''}`,
      link: '/teacher/applications',
      email: email ? applicationEmails.statusChanged(email, this.appUrl(), { vacancyTitle: v.title, schoolLabel: v.schoolLabel, status: to, message }) : undefined,
    });
  }

  private checkAnswers(vacancy: Vacancy, answers: { questionId: string; answer: string }[]): { questionId: string; answer: string }[] {
    const questions = vacancy.screeningQuestions as unknown as ScreeningQuestion[];
    const given = new Map(answers.map((a) => [a.questionId, a.answer]));
    const issues: { path: string; message: string }[] = [];
    const out = questions.map((q, i) => {
      const answer = given.get(q.id);
      if (!answer) issues.push({ path: `screeningAnswers.${i}`, message: `Answer: ${q.question}` });
      else if (q.type === 'yes_no' && !['yes', 'no'].includes(answer.toLowerCase())) issues.push({ path: `screeningAnswers.${i}`, message: 'Answer yes or no' });
      return { questionId: q.id, answer: q.type === 'yes_no' ? (answer ?? '').toLowerCase() : (answer ?? '') };
    });
    if (issues.length) throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Validation failed', { issues });
    return out;
  }

  private answersWithQuestions(vacancy: Vacancy, stored: Prisma.JsonValue): ScreeningAnswer[] {
    const questions = new Map((vacancy.screeningQuestions as unknown as ScreeningQuestion[]).map((q) => [q.id, q.question]));
    return ((stored ?? []) as { questionId: string; answer: string }[]).map((a) => ({
      questionId: a.questionId,
      question: questions.get(a.questionId) ?? 'Question removed',
      answer: a.answer,
    }));
  }

  /** Scheduling an interview moves the applicant to "interview" when that is a step forward. */
  async moveToInterview(applicationId: string, byId: string): Promise<void> {
    const a = await this.prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
    if (canMove(a.status, 'interview')) await this.record(a, 'interview', byId, undefined, false);
  }

  private async ownVacancy(user: AuthUser, vacancyId: string) {
    const v = await this.prisma.vacancy.findFirst({ where: { id: vacancyId, createdById: user.id, deletedAt: null } });
    if (!v) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Vacancy not found');
    return v;
  }

  /** An application on one of the caller's vacancies; anyone else's is "not found". */
  private async ownApplication(user: AuthUser, id: string) {
    const a = await this.prisma.application.findFirst({ where: { id, deletedAt: null, vacancy: { createdById: user.id } }, include: { vacancy: true } });
    if (!a) throw notFound();
    return a;
  }

  /** Applicant cards in the given order: safe teacher fields + contact (always shown, user decision). */
  private async applicants(ids: string[]): Promise<ApplicantResponse[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.application.findMany({
      where: { id: { in: ids } },
      include: {
        vacancy: true,
        cvSnapshot: { select: { fileName: true, mimeType: true } },
        teacher: { select: { id: true, user: { select: { phone: true, email: true } } } },
      },
    });
    const cards = await this.teachers.listItems(rows.map((r) => r.teacher.id));
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => {
      const a = byId.get(id)!;
      return {
        id: a.id,
        status: a.status,
        rating: a.rating,
        matchScore: a.matchScore,
        appliedAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        coverNote: a.coverNote,
        screeningAnswers: this.answersWithQuestions(a.vacancy, a.screeningAnswers),
        cv: { fileName: a.cvSnapshot.fileName, mimeType: a.cvSnapshot.mimeType },
        teacher: { ...cards.get(a.teacher.id)!, phone: a.teacher.user.phone, email: a.teacher.user.email },
        vacancy: { id: a.vacancy.id, title: a.vacancy.title, openings: a.vacancy.openings },
      };
    });
  }

  private appUrl(): string {
    return this.config.getOrThrow<string>('APP_URL');
  }
}

function toHistory(h: HistoryRow): HistoryEntry {
  return { id: h.id, fromStatus: h.fromStatus, toStatus: h.toStatus, message: h.message, by: ROLE_LABEL[h.changedBy.role], at: h.createdAt.toISOString() };
}

/** CSV cell: quoted, with formula characters neutralised (spreadsheet injection). */
function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
