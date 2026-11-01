import { HttpStatus, Injectable } from '@nestjs/common';
import type { reportSchema } from '@edu-forum/shared';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { ApiException } from '../../common/filters/api-exception.filter';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** PRD POST /reports: anyone signed in can report a teacher profile, vacancy, message, or community post/comment. */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, input: z.output<typeof reportSchema>): Promise<{ id: string }> {
    const ownerId = await this.ownerOf(input.targetType, input.targetId, user.id);
    if (ownerId === null) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Nothing to report here');
    if (ownerId === user.id) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', 'You cannot report your own content');
    const open = await this.prisma.report.findFirst({
      where: { reporterId: user.id, targetType: input.targetType, targetId: input.targetId, status: 'open' },
      select: { id: true },
    });
    if (open) throw new ApiException(HttpStatus.CONFLICT, 'CONFLICT', 'You have already reported this. Our team will review it.');
    const report = await this.prisma.report.create({
      data: { reporterId: user.id, targetType: input.targetType, targetId: input.targetId, reason: input.reason, details: input.details ?? null },
    });
    return { id: report.id };
  }

  /** The user who owns the reported thing, or null if it does not exist. */
  private async ownerOf(type: z.output<typeof reportSchema>['targetType'], id: string, reporterId: string): Promise<string | null> {
    if (type === 'teacher_profile') {
      return (await this.prisma.teacherProfile.findFirst({ where: { id, deletedAt: null }, select: { userId: true } }))?.userId ?? null;
    }
    if (type === 'vacancy') {
      return (await this.prisma.vacancy.findFirst({ where: { id, deletedAt: null }, select: { createdById: true } }))?.createdById ?? null;
    }
    if (type === 'community_post') {
      return (await this.prisma.communityPost.findFirst({ where: { id, deletedAt: null, removedReason: null }, select: { authorId: true } }))?.authorId ?? null;
    }
    if (type === 'community_comment') {
      return (await this.prisma.communityComment.findFirst({ where: { id, deletedAt: null, removedReason: null }, select: { authorId: true } }))?.authorId ?? null;
    }
    // Only someone in the chat can report one of its messages (others would learn it exists).
    const message = await this.prisma.message.findFirst({
      where: { id, conversation: { OR: [{ employerId: reporterId }, { teacher: { userId: reporterId } }] } },
      select: { senderId: true },
    });
    return message?.senderId ?? null;
  }
}
