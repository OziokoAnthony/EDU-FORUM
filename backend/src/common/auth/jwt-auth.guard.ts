import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ApiException } from '../filters/api-exception.filter';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AccessTokenPayload, AuthUser } from './auth-user';
import { IS_PUBLIC, REQUIRE_VERIFIED, ROLES, type RoleKey } from './decorators';

const ROLE_KEYS: Record<AuthUser['role'], RoleKey> = {
  teacher: 'teacher',
  school_owner: 'school',
  recruiter: 'school',
  admin: 'admin',
};

/**
 * Global guard: verifies the bearer access token, reloads the user (so suspension and
 * deletion take effect immediately), then applies @Roles and @RequireVerified.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw unauthorized('Sign in to continue');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw unauthorized('Session expired, please sign in again');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, status: true, deletedAt: true, emailVerifiedAt: true, phoneVerifiedAt: true },
    });
    if (!user || user.deletedAt) throw unauthorized('Sign in to continue');
    if (user.status === 'suspended') {
      throw new ApiException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Your account is suspended');
    }

    req.user = { id: user.id, role: user.role, verified: !!(user.emailVerifiedAt || user.phoneVerifiedAt) };

    const roles = this.reflector.getAllAndOverride<RoleKey[] | undefined>(ROLES, targets);
    if (roles?.length && !roles.includes(ROLE_KEYS[user.role])) {
      throw new ApiException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You do not have access to this');
    }

    if (this.reflector.getAllAndOverride<boolean>(REQUIRE_VERIFIED, targets) && !req.user.verified) {
      throw new ApiException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Verify your email or phone first', {
        reason: 'UNVERIFIED',
      });
    }
    return true;
  }
}

function unauthorized(message: string) {
  return new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', message);
}
