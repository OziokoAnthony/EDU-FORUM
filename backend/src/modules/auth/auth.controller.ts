import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  API_PREFIX,
  changePasswordSchema,
  forgotPasswordSchema,
  googleSignInSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  verifyPhoneSchema,
  type AuthTokensResponse,
} from '@edu-forum/shared';
import type { z } from 'zod';
import { CurrentUser, Public } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { User } from '../../generated/prisma/client';
import { toMeResponse } from '../users/me.mapper';
import { AuthService } from './auth.service';
import type { IssuedSession } from './session.service';

/** httpOnly refresh cookie, scoped to the auth routes only. */
export const REFRESH_COOKIE = 'ef_rt';
const COOKIE_PATH = `/${API_PREFIX}/auth`;

/** PRD: rate limit auth to 5 attempts/min per IP (AUTH_RATE_LIMIT); refresh/logout are exempt. */
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: z.output<typeof registerSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensResponse> {
    const { session, user } = await this.auth.register(body, client(req));
    return respond(res, session, user);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) body: { token: string }) {
    await this.auth.verifyEmail(body.token);
    return { verified: true };
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resend(
    @Body(new ZodValidationPipe(resendVerificationSchema)) body: z.output<typeof resendVerificationSchema>,
  ) {
    await this.auth.resendVerification(body.identifier);
    return { sent: true };
  }

  @Public()
  @Post('verify-phone')
  @HttpCode(HttpStatus.OK)
  async verifyPhone(@Body(new ZodValidationPipe(verifyPhoneSchema)) body: z.output<typeof verifyPhoneSchema>) {
    await this.auth.verifyPhone(body);
    return { verified: true };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: z.output<typeof loginSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensResponse> {
    const { session, user, deletionCancelled } = await this.auth.login(body, client(req));
    return { ...respond(res, session, user), ...(deletionCancelled ? { deletionCancelled } : {}) };
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async google(
    @Body(new ZodValidationPipe(googleSignInSchema)) body: z.output<typeof googleSignInSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensResponse> {
    const { session, user, deletionCancelled } = await this.auth.googleSignIn(body, client(req));
    return { ...respond(res, session, user), ...(deletionCancelled ? { deletionCancelled } : {}) };
  }

  /** Reads the refresh token from the httpOnly cookie (web) or the body (future mobile apps). */
  @Public()
  @SkipThrottle({ auth: true })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: z.output<typeof refreshSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const session = await this.auth.refresh(readRefresh(req, body), client(req));
      setRefreshCookie(res, session);
      return { accessToken: session.accessToken, expiresIn: session.expiresIn };
    } catch (err) {
      clearRefreshCookie(res);
      throw err;
    }
  }

  @SkipThrottle({ auth: true })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body(new ZodValidationPipe(refreshSchema)) body: z.output<typeof refreshSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(readRefresh(req, body));
    clearRefreshCookie(res);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgot(@Body(new ZodValidationPipe(forgotPasswordSchema)) body: z.output<typeof forgotPasswordSchema>) {
    await this.auth.forgotPassword(body.identifier);
    return { sent: true };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async reset(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: z.output<typeof resetPasswordSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.resetPassword(body);
    clearRefreshCookie(res);
    return { reset: true };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() me: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: z.output<typeof changePasswordSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokensResponse> {
    const { session, user } = await this.auth.changePassword(me.id, body, client(req));
    return respond(res, session, user);
  }
}

function client(req: Request) {
  return { userAgent: req.get('user-agent'), ip: req.ip };
}

function readRefresh(req: Request, body: { refreshToken?: string }): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE] ?? body.refreshToken;
}

function respond(res: Response, session: IssuedSession, user: User): AuthTokensResponse {
  setRefreshCookie(res, session);
  return { accessToken: session.accessToken, expiresIn: session.expiresIn, user: toMeResponse(user) };
}

function setRefreshCookie(res: Response, session: IssuedSession) {
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: COOKIE_PATH,
    expires: session.refreshExpiresAt,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
}
