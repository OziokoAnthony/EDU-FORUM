import { Body, Controller, Get, Global, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { notificationPreferencesSchema, notificationsQuerySchema } from '@edu-forum/shared';
import type { z } from 'zod';
import { CurrentUser } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

/** PRD "Notifications" endpoints; every signed-in role has them. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(notificationsQuerySchema)) q: z.output<typeof notificationsQuerySchema>) {
    return this.notifications.list(user, q);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }

  @Get('preferences')
  preferences(@CurrentUser() user: AuthUser) {
    return this.notifications.preferences(user);
  }

  @Put('preferences')
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(notificationPreferencesSchema)) body: z.output<typeof notificationPreferencesSchema>,
  ) {
    return this.notifications.updatePreferences(user, body);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user, id);
  }
}

/** Global so any feature can call `NotificationsService.notify`. */
@Global()
@Module({ controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
