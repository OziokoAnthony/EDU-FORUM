import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { applySchema, createInvitationSchema, invitationsQuerySchema } from '@edu-forum/shared';
import type { z } from 'zod';
import { CurrentUser, RequireVerified, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApplicationsModule } from '../applications/applications.module';
import { InvitationsService } from './invitations.service';

const uuid = new ParseUUIDPipe();
type Query = z.output<typeof invitationsQuerySchema>;

/** PRD "Invitations" endpoints. `GET /invitations/sent` replaces `/schools/me/invitations`. */
@Controller('invitations')
@RequireVerified()
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @Roles('leader')
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createInvitationSchema)) body: z.output<typeof createInvitationSchema>) {
    return this.invitations.create(user, body);
  }

  @Get('me')
  @Roles('teacher')
  received(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(invitationsQuerySchema)) q: Query) {
    return this.invitations.received(user, q);
  }

  @Get('sent')
  @Roles('leader')
  sent(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(invitationsQuerySchema)) q: Query) {
    return this.invitations.sent(user, q);
  }

  @Post(':id/accept')
  @Roles('teacher')
  accept(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(applySchema)) body: z.output<typeof applySchema>) {
    return this.invitations.accept(user, id, body);
  }

  @Post(':id/decline')
  @Roles('teacher')
  @HttpCode(HttpStatus.OK)
  decline(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.invitations.decline(user, id);
  }

  @Delete(':id')
  @Roles('leader')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.invitations.cancel(user, id);
  }
}

@Module({ imports: [ApplicationsModule], controllers: [InvitationsController], providers: [InvitationsService] })
export class InvitationsModule {}
