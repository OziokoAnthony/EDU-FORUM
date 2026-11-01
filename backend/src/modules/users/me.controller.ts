import { Body, Controller, Get, Patch } from '@nestjs/common';
import { updateMeSchema, type MeResponse, type OnboardingResponse } from '@edu-forum/shared';
import type { z } from 'zod';
import { CurrentUser } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
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

  @Get('onboarding')
  getOnboarding(@CurrentUser() user: AuthUser): Promise<OnboardingResponse> {
    return this.onboarding.forUser(user.id);
  }
}
