import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_NAME } from '@edu-forum/shared';
import { ApiException } from '../../common/filters/api-exception.filter';
import { hashOtp, hashToken, randomOtp, randomToken, safeEqual } from '../../common/auth/secrets';
import { MAILER, type Mailer } from '../../infra/mail/mailer';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SMS_SENDER, type SmsSender } from '../../infra/sms/sms-sender';
import type { AuthTokenType } from '../../generated/prisma/client';

const EMAIL_LINK_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_LINK_TTL_MS = 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

/** Email verification links, phone OTPs and password-reset links/codes. */
@Injectable()
export class OneTimeCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  async sendEmailVerification(user: { id: string; email: string }) {
    const token = await this.createLinkToken(user.id, 'email_verification', EMAIL_LINK_TTL_MS);
    const link = `${this.appUrl()}/verify-email?token=${token}`;
    await this.mailer.send({
      to: user.email,
      subject: `Confirm your email for ${APP_NAME}`,
      text: `Welcome to ${APP_NAME}.\n\nConfirm your email address by opening this link (valid for 24 hours):\n${link}\n\nIf you did not sign up, ignore this email.`,
      html: `<p>Welcome to ${APP_NAME}.</p><p><a href="${link}">Confirm your email address</a> (valid for 24 hours).</p><p>If you did not sign up, ignore this email.</p>`,
    });
  }

  async sendPhoneOtp(user: { id: string; phone: string }) {
    const code = await this.createOtp(user.id, 'phone_otp');
    await this.sms.send({ to: user.phone, text: `Your ${APP_NAME} code is ${code}. It expires in 10 minutes.` });
  }

  async sendPasswordResetEmail(user: { id: string; email: string }) {
    const token = await this.createLinkToken(user.id, 'password_reset', RESET_LINK_TTL_MS);
    const link = `${this.appUrl()}/reset-password?token=${token}`;
    await this.mailer.send({
      to: user.email,
      subject: `Reset your ${APP_NAME} password`,
      text: `Reset your password with this link (valid for 1 hour):\n${link}\n\nIf you did not ask for this, ignore this email; your password stays the same.`,
      html: `<p><a href="${link}">Reset your password</a> (valid for 1 hour).</p><p>If you did not ask for this, ignore this email; your password stays the same.</p>`,
    });
  }

  async sendPasswordResetOtp(user: { id: string; phone: string }) {
    const code = await this.createOtp(user.id, 'password_reset');
    await this.sms.send({ to: user.phone, text: `Your ${APP_NAME} password reset code is ${code}. It expires in 10 minutes.` });
  }

  /** Consumes a link token and returns its user id, or throws 400. */
  async consumeLinkToken(type: AuthTokenType, token: string): Promise<string> {
    const row = await this.prisma.authToken.findFirst({
      where: { type, tokenHash: hashToken(token), consumedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!row) throw invalid('This link is invalid or has expired');
    await this.prisma.authToken.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
    return row.userId;
  }

  /** Checks a 6-digit code for the user; counts failed attempts (max 5 per code). */
  async consumeOtp(type: AuthTokenType, userId: string, code: string): Promise<void> {
    const row = await this.prisma.authToken.findFirst({
      where: { userId, type, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || row.attempts >= OTP_MAX_ATTEMPTS) throw invalid('This code is invalid or has expired');
    if (!safeEqual(row.tokenHash, hashOtp(this.otpSecret(), userId, code))) {
      await this.prisma.authToken.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
      throw invalid('This code is incorrect');
    }
    await this.prisma.authToken.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  }

  private async createLinkToken(userId: string, type: AuthTokenType, ttlMs: number) {
    await this.invalidate(userId, type);
    const token = randomToken();
    await this.prisma.authToken.create({
      data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) },
    });
    return token;
  }

  private async createOtp(userId: string, type: AuthTokenType) {
    await this.invalidate(userId, type);
    const code = randomOtp();
    await this.prisma.authToken.create({
      data: { userId, type, tokenHash: hashOtp(this.otpSecret(), userId, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    return code;
  }

  /** Only the newest link/code of each type is valid. */
  private async invalidate(userId: string, type: AuthTokenType) {
    await this.prisma.authToken.updateMany({
      where: { userId, type, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  private appUrl() {
    return this.config.getOrThrow<string>('APP_URL');
  }

  private otpSecret() {
    return this.config.getOrThrow<string>('OTP_SECRET');
  }
}

function invalid(message: string) {
  return new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', message);
}
