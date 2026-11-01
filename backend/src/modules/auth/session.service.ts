import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { UserRole } from '@edu-forum/shared';
import { ApiException } from '../../common/filters/api-exception.filter';
import { hashToken, randomToken } from '../../common/auth/secrets';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  userId: string;
}

interface ClientInfo {
  userAgent?: string;
  ip?: string;
}

/**
 * Access JWT (15 min) + rotating refresh token (30 days). Each refresh revokes the old
 * token and issues a new one in the same family; re-using a revoked token outside the
 * grace window revokes the whole family (token theft).
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issue(user: { id: string; role: UserRole }, client: ClientInfo, familyId: string = randomUUID()) {
    const refreshToken = randomToken();
    const refreshExpiresAt = new Date(
      Date.now() + this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS') * 86_400_000,
    );
    const row = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        familyId,
        expiresAt: refreshExpiresAt,
        userAgent: client.userAgent?.slice(0, 255),
        ip: client.ip,
      },
    });
    return { session: await this.sign(user, refreshToken, refreshExpiresAt), rowId: row.id };
  }

  async rotate(refreshToken: string, client: ClientInfo): Promise<IssuedSession> {
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: { select: { id: true, role: true, status: true, deletedAt: true, deletionRequestedAt: true } } },
    });
    if (!current) throw invalidSession();

    const { user } = current;
    if (current.revokedAt) {
      // Re-presented just after it was rotated: a second tab, or a reload while the first
      // refresh was in flight (its new cookie never reached the browser). Give that client
      // its own token in the same family instead of signing it out. Outside the grace window
      // a revoked token means theft: the whole family is revoked.
      const graceMs = this.config.getOrThrow<number>('REFRESH_REUSE_GRACE_SECONDS') * 1000;
      const recentlyRotated = current.replacedBy && Date.now() - current.revokedAt.getTime() < graceMs;
      if (recentlyRotated && !user.deletedAt && !user.deletionRequestedAt && user.status === 'active' && current.expiresAt > new Date()) {
        return (await this.issue(user, client, current.familyId)).session;
      }
      await this.revokeFamily(current.familyId);
      throw invalidSession();
    }
    if (current.expiresAt < new Date()) throw invalidSession();

    if (user.deletedAt || user.deletionRequestedAt || user.status !== 'active') {
      await this.revokeFamily(current.familyId);
      throw invalidSession();
    }

    const { session, rowId } = await this.issue(user, client, current.familyId);
    // Conditional update: if a parallel request already rotated this token, treat as reuse.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: current.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedBy: rowId },
    });
    // A parallel request rotated this token a moment ago: this client keeps the token just
    // issued (same family), as in the grace case above.
    if (count === 0 && this.config.getOrThrow<number>('REFRESH_REUSE_GRACE_SECONDS') === 0) {
      await this.prisma.refreshToken.update({ where: { id: rowId }, data: { revokedAt: new Date() } });
      throw invalidSession();
    }
    return session;
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async sign(
    user: { id: string; role: UserRole },
    refreshToken: string,
    refreshExpiresAt: Date,
  ): Promise<IssuedSession> {
    const expiresIn = this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role }, { expiresIn });
    return { accessToken, expiresIn, refreshToken, refreshExpiresAt, userId: user.id };
  }
}

function invalidSession() {
  return new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Session expired, please sign in again');
}
