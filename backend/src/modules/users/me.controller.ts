import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Res } from '@nestjs/common';
import type { Response } from 'express';
import { updateMeSchema, type MeResponse, type OnboardingResponse } from '@edu-forum/shared';
import type { z } from 'zod';
import { CurrentUser } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { clearRefreshCookie } from '../auth/auth.controller';
import { MeService } from './me.service';
import { OnboardingService } from './onboarding.service';

@Controller('me')
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly onboarding: OnboardingService,
  ) {}

  @Get()
  get(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    return this.me.get(user.id);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateMeSchema)) body: z.output<typeof updateMeSchema>,
  ): Promise<MeResponse> {
    return this.me.update(user.id, body);
  }

  /** NDPA: account and data erased within 30 days; signs out everywhere now. */
  @Delete()
  @HttpCode(HttpStatus.ACCEPTED)
  async requestDeletion(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const scheduledFor = await this.me.requestDeletion(user.id);
    clearRefreshCookie(res);
    return { deletionScheduledFor: scheduledFor.toISOString() };
  }

  @Get('onboarding')
  getOnboarding(@CurrentUser() user: AuthUser): Promise<OnboardingResponse> {
    return this.onboarding.forUser(user.id);
  }
}
