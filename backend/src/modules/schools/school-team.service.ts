import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  APP_NAME,
  MEMBER_ROLE_LABELS,
  SCHOOL_INVITE_TTL_DAYS,
  type InvitePreviewResponse,
  type inviteMemberSchema,
  type MemberRole,
  type MembersResponse,
  type SchoolInviteResponse,
} from '@edu-forum/shared';
import type { z } from 'zod';
import { hashToken, randomToken } from '../../common/auth/secrets';
import { ApiException } from '../../common/filters/api-exception.filter';
import type { SchoolInvite, SchoolMember, UserRole } from '../../generated/prisma/client';
import { MAILER, type Mailer } from '../../infra/mail/mailer';
import { PrismaService } from '../../infra/prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const USER_ROLE_FOR: Record<MemberRole, UserRole> = { owner: 'school_owner', recruiter: 'recruiter' };

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const invalidInvite = () =>
  new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'This invite link is invalid or has expired. Ask the school to send a new one.');

/**
 * FR-3 step 5: owners invite recruiters (or co-owners) by email. A school can have several
 * owners but never zero; each person belongs to one school (confirmed 2026-10-31).
 */
@Injectable()
export class SchoolTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  async list(membership: SchoolMember, userId: string): Promise<MembersResponse> {
    const members = await this.prisma.schoolMember.findMany({
      where: { schoolId: membership.schoolId, status: 'active', deletedAt: null },
      include: { user: { select: { email: true, phone: true } } },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
    const invites =
      membership.role === 'owner'
        ? await this.prisma.schoolInvite.findMany({
            where: { schoolId: membership.schoolId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
          })
        : [];
    return {
      data: members.map((m) => ({
        userId: m.userId,
        email: m.user.email,
        phone: m.user.phone,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
        isMe: m.userId === userId,
      })),
      invites: invites.map(toInviteResponse),
    };
  }

  /**
   * Sends (or re-sends, with a fresh link) an invite. Whether the address belongs to a
   * teacher or another school is checked on accept, so owners cannot probe for accounts.
   */
  async invite(membership: SchoolMember, inviterId: string, input: z.output<typeof inviteMemberSchema>): Promise<SchoolInviteResponse> {
    const alreadyMember = await this.prisma.schoolMember.findFirst({
      where: { schoolId: membership.schoolId, status: 'active', deletedAt: null, user: { email: input.email } },
    });
    if (alreadyMember) throw new ApiException(HttpStatus.CONFLICT, 'CONFLICT', 'This person is already on your team');

    const token = randomToken();
    const expiresAt = new Date(Date.now() + SCHOOL_INVITE_TTL_DAYS * DAY_MS);
    const pending = await this.prisma.schoolInvite.findFirst({
      where: { schoolId: membership.schoolId, email: input.email, acceptedAt: null, revokedAt: null },
    });
    const invite = pending
      ? await this.prisma.schoolInvite.update({
          where: { id: pending.id },
          data: { tokenHash: hashToken(token), role: input.role, expiresAt, invitedById: inviterId },
        })
      : await this.prisma.schoolInvite.create({
          data: { schoolId: membership.schoolId, email: input.email, role: input.role, tokenHash: hashToken(token), invitedById: inviterId, expiresAt },
        });

    await this.prisma.school.updateMany({
      where: { id: membership.schoolId, NOT: { onboardingSteps: { has: 'team' } } },
      data: { onboardingSteps: { push: 'team' } },
    });
    await this.sendInviteEmail(invite, token);
    return toInviteResponse(invite);
  }

  async revoke(membership: SchoolMember, inviteId: string): Promise<void> {
    const { count } = await this.prisma.schoolInvite.updateMany({
      where: { id: inviteId, schoolId: membership.schoolId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Invite not found');
  }

  async preview(token: string): Promise<InvitePreviewResponse> {
    const invite = await this.findUsable(token);
    const account = await this.prisma.user.findFirst({ where: { email: invite.email, deletedAt: null }, select: { id: true } });
    return {
      schoolName: invite.school.name,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
      hasAccount: !!account,
    };
  }

  /** POST /schools/invites/:token/accept, by the signed-in invitee. The link proves their email. */
  async accept(userId: string, token: string): Promise<{ schoolId: string; role: MemberRole }> {
    const invite = await this.findUsable(token);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.email !== invite.email) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        `This invite was sent to ${invite.email}. Sign in with that email address to accept it.`,
      );
    }
    if (user.role === 'teacher' || user.role === 'admin') {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'BUSINESS_RULE',
        'This email is registered as a teacher account. A school team needs a separate school account.',
      );
    }
    const current = await this.prisma.schoolMember.findFirst({ where: { userId, status: 'active', deletedAt: null } });
    if (current?.schoolId === invite.schoolId) {
      throw new ApiException(HttpStatus.CONFLICT, 'CONFLICT', 'You are already on this school’s team');
    }
    if (current) {
      throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', 'You already belong to another school');
    }

    await this.prisma.$transaction(async (tx) => {
      // Conditional update: the same link cannot be accepted twice.
      const { count } = await tx.schoolInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (count === 0) throw invalidInvite();
      await tx.schoolMember.upsert({
        where: { schoolId_userId: { schoolId: invite.schoolId, userId } },
        update: { role: invite.role, status: 'active', deletedAt: null, invitedById: invite.invitedById },
        create: { schoolId: invite.schoolId, userId, role: invite.role, invitedById: invite.invitedById },
      });
      await tx.user.update({
        where: { id: userId },
        data: { role: USER_ROLE_FOR[invite.role], emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
      });
    });
    return { schoolId: invite.schoolId, role: invite.role };
  }

  async changeRole(membership: SchoolMember, targetUserId: string, role: MemberRole): Promise<void> {
    const target = await this.findMember(membership.schoolId, targetUserId);
    if (target.role === role) return;
    if (target.role === 'owner') await this.assertAnotherOwner(membership.schoolId, 'demote');
    await this.prisma.$transaction([
      this.prisma.schoolMember.update({ where: { id: target.id }, data: { role } }),
      this.prisma.user.update({ where: { id: targetUserId }, data: { role: USER_ROLE_FOR[role] } }),
    ]);
  }

  /** Removed members lose access on their next request (the guard checks membership every time). */
  async remove(membership: SchoolMember, targetUserId: string): Promise<void> {
    const target = await this.findMember(membership.schoolId, targetUserId);
    if (target.role === 'owner') await this.assertAnotherOwner(membership.schoolId, 'remove');
    await this.prisma.$transaction([
      this.prisma.schoolMember.update({ where: { id: target.id }, data: { status: 'removed' } }),
      // They keep a school account and may create or join another school.
      this.prisma.user.update({ where: { id: targetUserId }, data: { role: 'school_owner' } }),
    ]);
  }

  private async findMember(schoolId: string, userId: string) {
    const member = await this.prisma.schoolMember.findFirst({ where: { schoolId, userId, status: 'active', deletedAt: null } });
    if (!member) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Team member not found');
    return member;
  }

  private async assertAnotherOwner(schoolId: string, action: 'demote' | 'remove'): Promise<void> {
    const owners = await this.prisma.schoolMember.count({ where: { schoolId, role: 'owner', status: 'active', deletedAt: null } });
    if (owners <= 1) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'BUSINESS_RULE',
        `A school needs at least one owner. Make someone else an owner before you ${action} this one.`,
      );
    }
  }

  private async findUsable(token: string): Promise<SchoolInvite & { school: { name: string } }> {
    const invite = await this.prisma.schoolInvite.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { school: { select: { name: true, deletedAt: true } } },
    });
    if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < new Date() || invite.school.deletedAt) {
      throw invalidInvite();
    }
    return invite;
  }

  private async sendInviteEmail(invite: SchoolInvite, token: string): Promise<void> {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: invite.schoolId }, select: { name: true } });
    const link = `${this.config.getOrThrow<string>('APP_URL')}/join-school?token=${token}`;
    const role = MEMBER_ROLE_LABELS[invite.role].toLowerCase();
    await this.mailer.send({
      to: invite.email,
      subject: `${school.name} invited you to recruit teachers on ${APP_NAME}`,
      text: `${school.name} has invited you to join their team on ${APP_NAME} as ${role === 'owner' ? 'an owner' : 'a recruiter'}.\n\nAccept the invite (valid for ${SCHOOL_INVITE_TTL_DAYS} days):\n${link}\n\nIf you were not expecting this, ignore this email.`,
      html: `<p>${escapeHtml(school.name)} has invited you to join their team on ${APP_NAME} as ${role === 'owner' ? 'an owner' : 'a recruiter'}.</p><p><a href="${link}">Accept the invite</a> (valid for ${SCHOOL_INVITE_TTL_DAYS} days).</p><p>If you were not expecting this, ignore this email.</p>`,
    });
  }
}

function toInviteResponse(i: SchoolInvite): SchoolInviteResponse {
  return {
    id: i.id,
    email: i.email,
    role: i.role,
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
  };
}
