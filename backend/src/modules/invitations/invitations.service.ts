import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  INVITATION_EXPIRY_DAYS,
  MAX_INVITATIONS_PER_DAY,
  type applySchema,
  type createInvitationSchema,
  type invitationsQuerySchema,
  type MyApplicationResponse,
  type Paginated,
  type ReceivedInvitation,
  type ScreeningQuestion,
  type SentInvitation,
} from '@edu-forum/shared';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { ApiException } from '../../common/filters/api-exception.filter';
import type { Prisma } from '../../generated/prisma/client';
import { simpleEmail } from '../../infra/mail/simple-email';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ApplicationsService } from '../applications/applications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toVacancyResponse, VACANCY_INCLUDE } from '../vacancies/vacancy.serializer';
import { AVAILABLE_USER } from '../../common/available-user';

const DAY_MS = 24 * 60 * 60 * 1000;
const notFound = () => new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Invitation not found');
const rule = (message: string) => new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', message);

/**
 * FR-7.2 invitations: a principal/director invites a published teacher to one of their live
 * vacancies; the teacher accepts (which applies, screening questions included) or declines.
 * One invitation per teacher per vacancy and at most 50 a day per sender (confirmed
 * 2026-10-31). An invitation reveals an anonymous vacancy's school to that teacher.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applications: ApplicationsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async create(user: AuthUser, input: z.output<typeof createInvitationSchema>): Promise<SentInvitation> {
    const vacancy = await this.prisma.vacancy.findFirst({ where: { id: input.vacancyId, createdById: user.id, deletedAt: null }, include: VACANCY_INCLUDE });
    if (!vacancy) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Vacancy not found');
    if (vacancy.status !== 'published' || vacancy.takedownReason) throw rule('Publish the vacancy before inviting teachers');
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { id: input.teacherId, deletedAt: null, isPublished: true, user: AVAILABLE_USER },
      select: { id: true, userId: true, fullName: true, user: { select: { email: true } } },
    });
    if (!teacher) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Teacher not found');

    const applied = await this.prisma.application.findUnique({ where: { vacancyId_teacherId: { vacancyId: vacancy.id, teacherId: teacher.id } }, select: { id: true } });
    if (applied) throw new ApiException(HttpStatus.CONFLICT, 'CONFLICT', 'This teacher has already applied for this vacancy');
    const existing = await this.prisma.invitation.findFirst({
      where: { vacancyId: vacancy.id, teacherId: teacher.id, deletedAt: null, status: { not: 'cancelled' } },
      select: { id: true },
    });
    if (existing) throw new ApiException(HttpStatus.CONFLICT, 'CONFLICT', 'You have already invited this teacher to this vacancy');
    const today = await this.prisma.invitation.count({ where: { invitedById: user.id, createdAt: { gte: new Date(Date.now() - DAY_MS) } } });
    if (today >= MAX_INVITATIONS_PER_DAY) throw rule(`You can send up to ${MAX_INVITATIONS_PER_DAY} invitations a day. Try again tomorrow.`);

    const lapse = new Date(Date.now() + INVITATION_EXPIRY_DAYS * DAY_MS);
    const deadline = vacancy.deadline ? new Date(vacancy.deadline.getTime() + DAY_MS) : null; // end of the deadline day
    const invitation = await this.prisma.invitation.create({
      data: {
        vacancyId: vacancy.id,
        teacherId: teacher.id,
        invitedById: user.id,
        message: input.message ?? null,
        expiresAt: deadline && deadline < lapse ? deadline : lapse,
      },
    });

    // The invitation itself reveals the school (CLAUDE.md), so the teacher sees the name.
    const v = toVacancyResponse(vacancy, true);
    const lines = [`${v.schoolLabel} invited you to apply for ${v.title} (${v.location.lga.name}, ${v.location.state.name}).`];
    if (input.message) lines.push(`Message: ${input.message}`);
    await this.notifications.notify({
      userId: teacher.userId,
      type: 'invitation',
      title: `Invitation to apply: ${v.title}`,
      body: lines.join(' '),
      link: '/teacher/invitations',
      email: teacher.user.email
        ? simpleEmail(teacher.user.email, `You are invited to apply: ${v.title}`, lines, { url: `${this.appUrl()}/teacher/invitations`, text: 'See the invitation' })
        : undefined,
    });
    return this.sentItem(invitation.id);
  }

  async received(user: AuthUser, q: z.output<typeof invitationsQuerySchema>): Promise<Paginated<ReceivedInvitation>> {
    await this.expireStale();
    const where: Prisma.InvitationWhereInput = { teacher: { userId: user.id }, deletedAt: null, status: q.status ?? { not: 'cancelled' }, vacancyId: q.vacancyId };
    const [rows, total] = await Promise.all([
      this.prisma.invitation.findMany({ where, include: { vacancy: { include: VACANCY_INCLUDE } }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.invitation.count({ where }),
    ]);
    return {
      data: rows.map((i) => {
        const v = toVacancyResponse(i.vacancy, true);
        return {
          id: i.id,
          status: i.status,
          message: i.message,
          invitedAt: i.createdAt.toISOString(),
          expiresAt: i.expiresAt?.toISOString() ?? null,
          respondedAt: i.respondedAt?.toISOString() ?? null,
          applicationId: i.applicationId,
          vacancy: {
            id: v.id,
            title: v.title,
            schoolLabel: v.schoolLabel,
            state: v.location.state.name,
            lga: v.location.lga.name,
            salaryMin: v.salaryMin,
            salaryMax: v.salaryMax,
            salaryPeriod: v.salaryPeriod,
            screeningQuestions: i.vacancy.screeningQuestions as unknown as ScreeningQuestion[],
          },
        };
      }),
      meta: { page: q.page, limit: q.limit, total },
    };
  }

  async sent(user: AuthUser, q: z.output<typeof invitationsQuerySchema>): Promise<Paginated<SentInvitation>> {
    await this.expireStale();
    const where: Prisma.InvitationWhereInput = { invitedById: user.id, deletedAt: null, status: q.status, vacancyId: q.vacancyId };
    const [rows, total] = await Promise.all([
      this.prisma.invitation.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit, select: { id: true } }),
      this.prisma.invitation.count({ where }),
    ]);
    return { data: await Promise.all(rows.map((r) => this.sentItem(r.id))), meta: { page: q.page, limit: q.limit, total } };
  }

  /** Accepting applies with the teacher's current CV and the vacancy's screening answers. */
  async accept(user: AuthUser, id: string, input: z.output<typeof applySchema>): Promise<MyApplicationResponse> {
    const invitation = await this.openInvitation(user, id);
    return this.applications.apply(user, invitation.vacancyId, input, { invitationId: invitation.id });
  }

  async decline(user: AuthUser, id: string): Promise<{ id: string; status: 'declined' }> {
    const invitation = await this.openInvitation(user, id);
    const { count } = await this.prisma.invitation.updateMany({ where: { id, status: 'pending' }, data: { status: 'declined', respondedAt: new Date() } });
    if (count === 0) throw rule('This invitation is no longer open');
    const name = invitation.teacher.fullName ?? 'A teacher';
    const lines = [`${name} declined your invitation to apply for ${invitation.vacancy.title}.`];
    await this.notifications.notify({
      userId: invitation.invitedById,
      type: 'invitation_reply',
      title: `Invitation declined: ${invitation.vacancy.title}`,
      body: lines[0],
      link: '/hiring/invitations',
      email: invitation.invitedBy.email
        ? simpleEmail(invitation.invitedBy.email, `Invitation declined: ${invitation.vacancy.title}`, lines, { url: `${this.appUrl()}/hiring/invitations`, text: 'See your invitations' })
        : undefined,
    });
    return { id, status: 'declined' };
  }

  /** Only pending invitations can be cancelled; the teacher simply stops seeing it. */
  async cancel(user: AuthUser, id: string): Promise<void> {
    const invitation = await this.prisma.invitation.findFirst({ where: { id, invitedById: user.id, deletedAt: null } });
    if (!invitation) throw notFound();
    const { count } = await this.prisma.invitation.updateMany({ where: { id, status: 'pending' }, data: { status: 'cancelled', respondedAt: new Date() } });
    if (count === 0) throw rule('Only invitations waiting for a reply can be cancelled');
  }

  /** Pending invitations lapse at expiresAt, or as soon as their vacancy stops being live. */
  async expireStale(now = new Date()): Promise<number> {
    const { count } = await this.prisma.invitation.updateMany({
      where: {
        status: 'pending',
        OR: [{ expiresAt: { lte: now } }, { vacancy: { OR: [{ status: { not: 'published' } }, { deletedAt: { not: null } }, { takedownReason: { not: null } }] } }],
      },
      data: { status: 'expired' },
    });
    return count;
  }

  private async openInvitation(user: AuthUser, id: string) {
    await this.expireStale();
    const invitation = await this.prisma.invitation.findFirst({
      where: { id, deletedAt: null, teacher: { userId: user.id }, status: { not: 'cancelled' } },
      include: { vacancy: { select: { title: true } }, teacher: { select: { fullName: true } }, invitedBy: { select: { email: true } } },
    });
    if (!invitation) throw notFound();
    if (invitation.status !== 'pending') throw rule(invitation.status === 'expired' ? 'This invitation has expired' : 'You have already replied to this invitation');
    return invitation;
  }

  private async sentItem(id: string): Promise<SentInvitation> {
    const i = await this.prisma.invitation.findUniqueOrThrow({
      where: { id },
      include: { vacancy: { select: { id: true, title: true } }, teacher: { select: { id: true, fullName: true } } },
    });
    return {
      id: i.id,
      status: i.status,
      message: i.message,
      invitedAt: i.createdAt.toISOString(),
      respondedAt: i.respondedAt?.toISOString() ?? null,
      applicationId: i.applicationId,
      vacancy: i.vacancy,
      teacher: i.teacher,
    };
  }

  private appUrl(): string {
    return this.config.getOrThrow<string>('APP_URL');
  }
}
