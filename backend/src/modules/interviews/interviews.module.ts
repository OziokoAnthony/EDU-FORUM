import { Body, Controller, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { cancelInterviewSchema, interviewsQuerySchema, proposeInterviewSchema, scheduleInterviewSchema, updateInterviewSchema } from '@edu-forum/shared';
import type { z } from 'zod';
import { CurrentUser, RequireVerified, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApplicationsModule } from '../applications/applications.module';
import { InterviewsService } from './interviews.service';

const uuid = new ParseUUIDPipe();

/** PRD: POST /applications/:id/interviews. GET is added (applicant detail page; listed in CLAUDE.md). */
@Controller('applications/:applicationId/interviews')
@RequireVerified()
export class ApplicationInterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  @Post()
  @Roles('leader')
  schedule(
    @CurrentUser() user: AuthUser,
    @Param('applicationId', uuid) applicationId: string,
    @Body(new ZodValidationPipe(scheduleInterviewSchema)) body: z.output<typeof scheduleInterviewSchema>,
  ) {
    return this.interviews.schedule(user, applicationId, body);
  }

  @Get()
  @Roles('teacher', 'leader')
  list(@CurrentUser() user: AuthUser, @Param('applicationId', uuid) applicationId: string) {
    return this.interviews.forApplication(user, applicationId);
  }
}

/** PRD "Interviews" endpoints. */
@Controller('interviews')
@RequireVerified()
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  @Get('me')
  @Roles('teacher', 'leader')
  mine(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(interviewsQuerySchema)) q: z.output<typeof interviewsQuerySchema>) {
    return this.interviews.list(user, q);
  }

  @Patch(':id')
  @Roles('leader')
  update(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(updateInterviewSchema)) body: z.output<typeof updateInterviewSchema>) {
    return this.interviews.update(user, id, body);
  }

  @Post(':id/confirm')
  @Roles('teacher')
  @HttpCode(HttpStatus.OK)
  confirm(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.interviews.confirm(user, id);
  }

  @Post(':id/propose')
  @Roles('teacher')
  @HttpCode(HttpStatus.OK)
  propose(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(proposeInterviewSchema)) body: z.output<typeof proposeInterviewSchema>) {
    return this.interviews.propose(user, id, body);
  }

  @Post(':id/cancel')
  @Roles('teacher', 'leader')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(cancelInterviewSchema)) body: z.output<typeof cancelInterviewSchema>) {
    return this.interviews.cancel(user, id, body);
  }

  @Post(':id/complete')
  @Roles('leader')
  @HttpCode(HttpStatus.OK)
  complete(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.interviews.complete(user, id);
  }
}

@Module({ imports: [ApplicationsModule], controllers: [ApplicationInterviewsController, InterviewsController], providers: [InterviewsService] })
export class InterviewsModule {}
