import { HttpStatus, Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ACTIVE_INTERVIEW_STATUSES,
  APP_NAME,
  FINAL_STATUSES,
  INTERVIEW_MODE_LABELS,
  INTERVIEW_REMINDER_HOURS,
  type cancelInterviewSchema,
  type InterviewItem,
  type interviewsQuerySchema,
  type Paginated,
  type proposeInterviewSchema,
  type scheduleInterviewSchema,
  type updateInterviewSchema,
} from '@edu-forum/shared';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { ApiException } from '../../common/filters/api-exception.filter';
import type { Prisma } from '../../generated/prisma/client';
import { simpleEmail } from '../../infra/mail/simple-email';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { JOB_QUEUE, type JobQueue } from '../../infra/queue/job-queue';
import { ApplicationsService } from '../applications/applications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toVacancyResponse, VACANCY_INCLUDE } from '../vacancies/vacancy.serializer';

export const INTERVIEW_REMINDERS_JOB = 'interview-reminders';
const HOUR_MS = 60 * 60 * 1000;
const notFound = () => new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Interview not found');
const rule = (message: string) => new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', message);

const INCLUDE = {
  application: {
    include: {
      vacancy: { include: VACANCY_INCLUDE },
      teacher: { select: { id: true, fullName: true, userId: true, user: { select: { email: true } } } },
    },
  },
} satisfies Prisma.InterviewInclude;
type Row = Prisma.InterviewGetPayload<{ include: typeof INCLUDE }>;
type Party = 'teacher' | 'poster';

/** Lagos time for emails and notices (all of Nigeria is WAT, UTC+1). */
const when = (d: Date) =>
  d.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * FR-7.5 interviews: the poster schedules (date, time, mode and where); the teacher confirms
 * or proposes another time; either side can cancel; the poster marks it done. Both sides get
 * a reminder 24 hours before (confirmed 2026-10-31). Interviewing reveals the school.
 */
@Injectable()
export class InterviewsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applications: ApplicationsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue.register(INTERVIEW_REMINDERS_JOB, () => this.sendReminders().then(() => undefined));
    await this.queue.schedule(INTERVIEW_REMINDERS_JOB, '*/15 * * * *');
  }

  async schedule(user: AuthUser, applicationId: string, input: z.output<typeof scheduleInterviewSchema>): Promise<InterviewItem> {
    const a = await this.prisma.application.findFirst({ where: { id: applicationId, deletedAt: null, vacancy: { createdById: user.id } } });
    if (!a) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Application not found');
    if (FINAL_STATUSES.includes(a.status)) throw rule('This application is closed');
    const active = await this.prisma.interview.findFirst({ where: { applicationId, deletedAt: null, status: { in: ACTIVE_INTERVIEW_STATUSES } } });
    if (active) throw rule('This applicant already has an interview booked. Change or cancel it instead.');

    const interview = await this.prisma.interview.create({
      data: {
        applicationId,
        scheduledAt: new Date(input.scheduledAt),
        durationMinutes: input.durationMinutes ?? null,
        mode: input.mode,
        locationOrLink: input.locationOrLink,
        notes: input.notes ?? null,
      },
      include: INCLUDE,
    });
    await this.applications.moveToInterview(applicationId, user.id);
    await this.tell(interview, 'teacher', 'Interview invitation', (v) => `${v.schoolLabel} would like to interview you for ${v.title}: ${this.details(interview)}. Please confirm or suggest another time.`);
    return this.item(interview);
  }

  async list(user: AuthUser, q: z.output<typeof interviewsQuerySchema>): Promise<Paginated<InterviewItem>> {
    const mine: Prisma.InterviewWhereInput =
      user.role === 'teacher' ? { application: { teacher: { userId: user.id } } } : { application: { vacancy: { createdById: user.id } } };
    // Upcoming keeps interviews that started in the last 2 hours, so today's still show.
    const recent = new Date(Date.now() - 2 * HOUR_MS);
    const where: Prisma.InterviewWhereInput = q.past
      ? { ...mine, deletedAt: null, OR: [{ status: { notIn: ACTIVE_INTERVIEW_STATUSES } }, { scheduledAt: { lt: recent } }] }
      : { ...mine, deletedAt: null, status: { in: ACTIVE_INTERVIEW_STATUSES }, scheduledAt: { gte: recent } };
    const [rows, total] = await Promise.all([
      this.prisma.interview.findMany({ where, include: INCLUDE, orderBy: { scheduledAt: q.past ? 'desc' : 'asc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.interview.count({ where }),
    ]);
    return { data: rows.map((r) => this.item(r)), meta: { page: q.page, limit: q.limit, total } };
  }

  /** Interviews of one application (applicant detail page). */
  async forApplication(user: AuthUser, applicationId: string): Promise<InterviewItem[]> {
    const rows = await this.prisma.interview.findMany({
      where: { applicationId, deletedAt: null, application: user.role === 'teacher' ? { teacher: { userId: user.id } } : { vacancy: { createdById: user.id } } },
      include: INCLUDE,
      orderBy: { scheduledAt: 'desc' },
    });
    return rows.map((r) => this.item(r));
  }

  /** Reschedule or update details. A new time goes back to the teacher to confirm. */
  async update(user: AuthUser, id: string, input: z.output<typeof updateInterviewSchema>): Promise<InterviewItem> {
    const current = await this.own(user, id, 'poster');
    this.mustBeActive(current);
    const mode = input.mode ?? current.mode;
    const where = input.locationOrLink ?? current.locationOrLink;
    if (mode === 'video' && !/^https?:\/\/\S+$/i.test(where)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Invalid input', {
        issues: [{ path: 'locationOrLink', message: 'Paste the full video link, starting with https://' }],
      });
    }
    const moved = input.scheduledAt !== undefined && new Date(input.scheduledAt).getTime() !== current.scheduledAt.getTime();
    const updated = await this.prisma.interview.update({
      where: { id },
      data: {
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        durationMinutes: input.durationMinutes,
        mode: input.mode,
        locationOrLink: input.locationOrLink,
        notes: input.notes,
        ...(moved ? { status: 'rescheduled' as const, proposedAt: null, proposalNote: null, reminderSentAt: null } : {}),
      },
      include: INCLUDE,
    });
    await this.tell(updated, 'teacher', moved ? 'Interview moved' : 'Interview details updated', (v) =>
      moved ? `Your interview for ${v.title} is now ${this.details(updated)}. Please confirm the new time.` : `Your interview for ${v.title}: ${this.details(updated)}.`,
    );
    return this.item(updated);
  }

  async confirm(user: AuthUser, id: string): Promise<InterviewItem> {
    const current = await this.own(user, id, 'teacher');
    this.mustBeActive(current);
    if (current.status === 'confirmed') throw rule('You have already confirmed this interview');
    const updated = await this.prisma.interview.update({ where: { id }, data: { status: 'confirmed', proposedAt: null, proposalNote: null }, include: INCLUDE });
    await this.tell(updated, 'poster', 'Interview confirmed', (v) => `${this.teacherName(updated)} confirmed the interview for ${v.title}: ${when(updated.scheduledAt)}.`);
    return this.item(updated);
  }

  /** The teacher suggests another time; the poster accepts it by rescheduling (PATCH). */
  async propose(user: AuthUser, id: string, input: z.output<typeof proposeInterviewSchema>): Promise<InterviewItem> {
    const current = await this.own(user, id, 'teacher');
    this.mustBeActive(current);
    const updated = await this.prisma.interview.update({
      where: { id },
      data: { proposedAt: new Date(input.proposedAt), proposalNote: input.note ?? null, status: current.status === 'confirmed' ? 'proposed' : current.status },
      include: INCLUDE,
    });
    await this.tell(updated, 'poster', 'New interview time suggested', (v) =>
      `${this.teacherName(updated)} asked to move the interview for ${v.title} to ${when(updated.proposedAt!)}.${input.note ? ` Note: ${input.note}` : ''}`,
    );
    return this.item(updated);
  }

  async cancel(user: AuthUser, id: string, input: z.output<typeof cancelInterviewSchema>): Promise<InterviewItem> {
    const by: Party = user.role === 'teacher' ? 'teacher' : 'poster';
    const current = await this.own(user, id, by);
    this.mustBeActive(current);
    const updated = await this.prisma.interview.update({ where: { id }, data: { status: 'cancelled', cancelReason: input.reason ?? null }, include: INCLUDE });
    const reason = input.reason ? ` Reason: ${input.reason}` : '';
    if (by === 'teacher') {
      await this.tell(updated, 'poster', 'Interview cancelled', (v) => `${this.teacherName(updated)} cancelled the interview for ${v.title} (${when(updated.scheduledAt)}).${reason}`);
    } else {
      await this.tell(updated, 'teacher', 'Interview cancelled', (v) => `Your interview for ${v.title} on ${when(updated.scheduledAt)} was cancelled.${reason}`);
    }
    return this.item(updated);
  }

  async complete(user: AuthUser, id: string): Promise<InterviewItem> {
    const current = await this.own(user, id, 'poster');
    this.mustBeActive(current);
    if (current.scheduledAt.getTime() > Date.now()) throw rule('You can mark an interview done once its time has come');
    const updated = await this.prisma.interview.update({ where: { id }, data: { status: 'done' }, include: INCLUDE });
    return this.item(updated);
  }

  /** Every 15 minutes: one reminder to each side for interviews in the next 24 hours. */
  async sendReminders(now = new Date()): Promise<number> {
    const due = await this.prisma.interview.findMany({
      where: {
        deletedAt: null,
        status: { in: ACTIVE_INTERVIEW_STATUSES },
        reminderSentAt: null,
        scheduledAt: { gt: now, lte: new Date(now.getTime() + INTERVIEW_REMINDER_HOURS * HOUR_MS) },
      },
      include: INCLUDE,
    });
    for (const row of due) {
      // Claim first, so two workers never remind twice.
      const { count } = await this.prisma.interview.updateMany({ where: { id: row.id, reminderSentAt: null }, data: { reminderSentAt: now } });
      if (count === 0) continue;
      await this.tell(row, 'teacher', 'Interview reminder', (v) => `Reminder: your interview for ${v.title} at ${v.schoolLabel} is ${this.details(row)}.`);
      await this.tell(row, 'poster', 'Interview reminder', (v) => `Reminder: interview with ${this.teacherName(row)} for ${v.title}, ${this.details(row)}.`);
    }
    return due.length;
  }

  // ───────────── helpers ─────────────

  private async own(user: AuthUser, id: string, as: Party): Promise<Row> {
    const application: Prisma.ApplicationWhereInput = as === 'teacher' ? { teacher: { userId: user.id } } : { vacancy: { createdById: user.id } };
    const row = await this.prisma.interview.findFirst({ where: { id, deletedAt: null, application }, include: INCLUDE });
    if (!row) throw notFound();
    return row;
  }

  private mustBeActive(row: Row): void {
    if (!ACTIVE_INTERVIEW_STATUSES.includes(row.status)) throw rule(`This interview is ${row.status === 'done' ? 'already done' : 'cancelled'}`);
  }

  private details(row: Row): string {
    const mins = row.durationMinutes ? ` (${row.durationMinutes} min)` : '';
    return `${when(row.scheduledAt)}${mins}, ${INTERVIEW_MODE_LABELS[row.mode].toLowerCase()}: ${row.locationOrLink}`;
  }

  private teacherName(row: Row): string {
    return row.application.teacher.fullName ?? 'The teacher';
  }

  /** In-app + email to one side; the teacher's link goes to their interviews, the poster's to the applicant. */
  private async tell(row: Row, to: Party, title: string, body: (v: { title: string; schoolLabel: string }) => string): Promise<void> {
    const v = toVacancyResponse(row.application.vacancy, true);
    const text = body({ title: v.title, schoolLabel: v.schoolLabel });
    const isTeacher = to === 'teacher';
    const userId = isTeacher ? row.application.teacher.userId : row.application.vacancy.createdById;
    const email = isTeacher
      ? row.application.teacher.user.email
      : (await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email;
    const link = isTeacher ? '/teacher/interviews' : `/hiring/applications/${row.applicationId}`;
    await this.notifications.notify({
      userId,
      type: 'interview',
      smsCategory: 'interviews',
      title: `${title}: ${v.title}`,
      body: text,
      link,
      email: email ? simpleEmail(email, `${title}: ${v.title}`, [text], { url: `${this.config.getOrThrow<string>('APP_URL')}${link}`, text: `Open ${APP_NAME}` }) : undefined,
    });
  }

  private item(row: Row): InterviewItem {
    const v = toVacancyResponse(row.application.vacancy, true);
    return {
      id: row.id,
      applicationId: row.applicationId,
      scheduledAt: row.scheduledAt.toISOString(),
      durationMinutes: row.durationMinutes,
      mode: row.mode,
      locationOrLink: row.locationOrLink,
      status: row.status,
      notes: row.notes,
      proposedAt: row.proposedAt?.toISOString() ?? null,
      proposalNote: row.proposalNote,
      cancelReason: row.cancelReason,
      vacancy: { id: v.id, title: v.title, schoolLabel: v.schoolLabel },
      teacher: { id: row.application.teacher.id, fullName: row.application.teacher.fullName },
    };
  }
}
