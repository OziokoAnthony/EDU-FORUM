import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { SchoolMember } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ApiException } from '../filters/api-exception.filter';
import type { AuthUser } from './auth-user';

export const SCHOOL_OWNER = 'schoolOwner';

/** PRD auth column "SO": only an owner of the caller's school. Use with SchoolGuard. */
export const SchoolOwner = () => SetMetadata(SCHOOL_OWNER, true);

type SchoolRequest = Request & { user: AuthUser; membership?: SchoolMember };

/**
 * Resolves the caller's school (their one active membership) for `/schools/me/*`, and
 * applies @SchoolOwner(). Runs after the global JwtAuthGuard and @Roles('school').
 */
@Injectable()
export class SchoolGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<SchoolRequest>();
    const membership = await this.prisma.schoolMember.findFirst({
      where: { userId: req.user.id, status: 'active', deletedAt: null, school: { deletedAt: null } },
    });
    if (!membership) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'You have not set up a school yet');
    }
    const ownerOnly = this.reflector.getAllAndOverride<boolean>(SCHOOL_OWNER, [ctx.getHandler(), ctx.getClass()]);
    if (ownerOnly && membership.role !== 'owner') {
      throw new ApiException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Only a school owner can do this');
    }
    req.membership = membership;
    return true;
  }
}

/** The caller's active school membership (set by SchoolGuard). */
export const CurrentMembership = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SchoolMember => ctx.switchToHttp().getRequest<SchoolRequest>().membership!,
);
