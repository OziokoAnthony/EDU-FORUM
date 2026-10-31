import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { conversationsQuerySchema, messagesQuerySchema, sendMessageSchema, startConversationSchema } from '@edu-forum/shared';
import type { z } from 'zod';
import { CurrentUser, RequireVerified, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UploadsModule } from '../uploads/uploads.module';
import { MessagingService } from './messaging.service';

const uuid = new ParseUUIDPipe();

/**
 * PRD "Messaging" endpoints. Added beyond the PRD table (listed in CLAUDE.md):
 * GET /conversations/:id, POST /conversations/:id/unblock,
 * DELETE /conversations/:id/messages/:messageId, GET /conversations/:id/messages/:messageId/attachment.
 */
@Controller('conversations')
@RequireVerified()
@Roles('teacher', 'leader')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(conversationsQuerySchema)) q: z.output<typeof conversationsQuerySchema>) {
    return this.messaging.list(user, q);
  }

  /** Only principals and directors open chats (confirmed 2026-10-31); teachers reply. */
  @Post()
  @Roles('leader')
  @HttpCode(HttpStatus.OK)
  start(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(startConversationSchema)) body: z.output<typeof startConversationSchema>) {
    return this.messaging.start(user, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.messaging.get(user, id);
  }

  @Get(':id/messages')
  messages(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Query(new ZodValidationPipe(messagesQuerySchema)) q: z.output<typeof messagesQuerySchema>) {
    return this.messaging.messages(user, id, q);
  }

  @Post(':id/messages')
  send(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(sendMessageSchema)) body: z.output<typeof sendMessageSchema>) {
    return this.messaging.send(user, id, body);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  read(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.messaging.markRead(user, id);
  }

  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  block(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.messaging.block(user, id);
  }

  @Post(':id/unblock')
  @HttpCode(HttpStatus.OK)
  unblock(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.messaging.unblock(user, id);
  }

  @Delete(':id/messages/:messageId')
  deleteMessage(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Param('messageId', uuid) messageId: string) {
    return this.messaging.deleteMessage(user, id, messageId);
  }

  @Get(':id/messages/:messageId/attachment')
  attachment(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Param('messageId', uuid) messageId: string) {
    return this.messaging.attachmentLink(user, id, messageId);
  }
}

@Module({ imports: [UploadsModule], controllers: [MessagingController], providers: [MessagingService] })
export class ConversationsModule {}
