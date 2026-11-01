import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import {
  CONSENT_VERSION,
  type changePasswordSchema,
  type identifierSchema,
  type loginSchema,
  type registerSchema,
  type resetPasswordSchema,
  type verifyPhoneSchema,
} from '@edu-forum/shared';
import type { z } from 'zod';
import { ApiException } from '../../common/filters/api-exception.filter';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { JOB_QUEUE, type JobQueue } from '../../infra/queue/job-queue';
import type { User } from '../../generated/prisma/client';
import { OneTimeCodesService } from './one-time-codes.service';
import { SessionService } from './session.service';

/** Handled by AccountDeletionService (users module): re-announces the user's live vacancies. */
export const ACCOUNT_RESTORED_JOB = 'account-restored';

type Identifier = z.output<typeof identifierSchema>;
interface ClientInfo {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly codes: OneTimeCodesService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  async register(input: z.output<typeof registerSchema>, client: ClientInfo) {
    if (input.email && (await this.findActive({ kind: 'email', value: input.email }))) {
      throw conflict('An account with this email already exists');
    }
    if (input.phone && (await this.findActive({ kind: 'phone', value: input.phone }))) {
      throw conflict('An account with this phone number already exists');
    }

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        phone: input.phone,
        passwordHash: await hash(input.password),
        role: input.role,
        consentAcceptedAt: new Date(),
        consentVersion: CONSENT_VERSION,
      },
    });

    await this.sendVerification(user);
    return this.startSession(user, client);
  }

  async login(input: z.output<typeof loginSchema>, client: ClientInfo) {
    const user = await this.findActive(input.identifier);
    const ok = user?.passwordHash ? await verify(user.passwordHash, input.password) : false;
    if (!user || !ok) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Incorrect email/phone or password');
    }
    if (user.status === 'suspended') {
      throw new ApiException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Your account is suspended');
    }
    // Signing in within the 30-day grace period cancels a requested account deletion.
    const deletionCancelled = !!user.deletionRequestedAt;
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), ...(deletionCancelled ? { deletionRequestedAt: null } : {}) },
    });
    if (deletionCancelled) await this.queue.add(ACCOUNT_RESTORED_JOB, { userId: user.id });
    return { ...(await this.startSession(updated, client)), deletionCancelled };
  }

  refresh(refreshToken: string | undefined, client: ClientInfo) {
    if (!refreshToken) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Session expired, please sign in again');
    }
    return this.sessions.rotate(refreshToken, client);
  }

  async logout(refreshToken: string | undefined) {
    if (refreshToken) await this.sessions.revoke(refreshToken);
  }

  async verifyEmail(token: string) {
    const userId = await this.codes.consumeLinkToken('email_verification', token);
    await this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  }

  async verifyPhone(input: z.output<typeof verifyPhoneSchema>) {
    const user = await this.findActive({ kind: 'phone', value: input.phone });
    if (!user) throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'This code is invalid or has expired');
    await this.codes.consumeOtp('phone_otp', user.id, input.code);
    await this.prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } });
  }

  /** Always succeeds so the response does not reveal whether an account exists. */
  async resendVerification(identifier: Identifier) {
    const user = await this.findActive(identifier);
    if (!user) return;
    if (identifier.kind === 'email' && user.email && !user.emailVerifiedAt) {
      await this.codes.sendEmailVerification({ id: user.id, email: user.email });
    }
    if (identifier.kind === 'phone' && user.phone && !user.phoneVerifiedAt) {
      await this.codes.sendPhoneOtp({ id: user.id, phone: user.phone });
    }
  }

  /** Always succeeds so the response does not reveal whether an account exists. */
  async forgotPassword(identifier: Identifier) {
    const user = await this.findActive(identifier);
    if (!user) return;
    if (identifier.kind === 'email' && user.email) {
      await this.codes.sendPasswordResetEmail({ id: user.id, email: user.email });
    } else if (identifier.kind === 'phone' && user.phone) {
      await this.codes.sendPasswordResetOtp({ id: user.id, phone: user.phone });
    }
  }

  /** Resetting signs the user out everywhere. The link/code also proves the email/phone. */
  async resetPassword(input: z.output<typeof resetPasswordSchema>) {
    let userId: string;
    let proves: 'emailVerifiedAt' | 'phoneVerifiedAt';
    if ('token' in input) {
      userId = await this.codes.consumeLinkToken('password_reset', input.token);
      proves = 'emailVerifiedAt';
    } else {
      const user = await this.findActive({ kind: 'phone', value: input.phone });
      if (!user) throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'This code is invalid or has expired');
      await this.codes.consumeOtp('password_reset', user.id, input.code);
      userId = user.id;
      proves = 'phoneVerifiedAt';
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hash(input.password), [proves]: user[proves] ?? new Date() },
    });
    await this.sessions.revokeAllForUser(userId);
  }

  /** Changing the password signs out other devices and starts a fresh session here. */
  async changePassword(userId: string, input: z.output<typeof changePasswordSchema>, client: ClientInfo) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await verify(user.passwordHash, input.currentPassword))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Current password is incorrect', {
        issues: [{ path: 'currentPassword', message: 'Current password is incorrect' }],
      });
    }
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hash(input.newPassword) } });
    await this.sessions.revokeAllForUser(userId);
    return this.startSession(user, client);
  }

  async sendVerification(user: User) {
    if (user.email && !user.emailVerifiedAt) {
      await this.codes.sendEmailVerification({ id: user.id, email: user.email });
    }
    if (user.phone && !user.phoneVerifiedAt) {
      await this.codes.sendPhoneOtp({ id: user.id, phone: user.phone });
    }
  }

  private async startSession(user: User, client: ClientInfo) {
    const { session } = await this.sessions.issue(user, client);
    return { session, user };
  }

  private findActive(identifier: Identifier) {
    return this.prisma.user.findFirst({
      where: { [identifier.kind]: identifier.value, deletedAt: null },
    });
  }
}

function conflict(message: string) {
  return new ApiException(HttpStatus.CONFLICT, 'CONFLICT', message);
}
