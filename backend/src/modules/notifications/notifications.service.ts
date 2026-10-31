import { HttpStatus, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
  WS_EVENTS,
  type NotificationCategory,
  type NotificationItem,
  type NotificationPreferences,
  type notificationsQuerySchema,
  type NotificationType,
  type Paginated,
} from '@edu-forum/shared';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { ApiException } from '../../common/filters/api-exception.filter';
import type { Prisma } from '../../generated/prisma/client';
import { EmailQueue } from '../../infra/mail/email-queue';
import type { MailMessage } from '../../infra/mail/mailer';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RealtimeGateway } from '../../infra/realtime/realtime.gateway';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** In-app link, e.g. "/teacher/applications". */
  link?: string;
  /** The email to queue when the user's preference for this category is on. */
  email?: MailMessage;
  /** Account notices (moderation) are emailed even when the category is switched off. */
  alwaysEmail?: boolean;
}

interface Payload {
  title: string;
  body: string;
  link: string | null;
}

/** Stored under users.notification_settings as `{ email: { <category>: boolean } }`; missing = on. */
const emailPreferences = (settings: Prisma.JsonValue): Record<NotificationCategory, boolean> => {
  const stored = (settings as { email?: Partial<Record<NotificationCategory, boolean>> } | null)?.email ?? {};
  return Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, stored[c] !== false])) as Record<NotificationCategory, boolean>;
};

/**
 * FR-9 notifications: one call writes the in-app notification, pushes it to the user's open
 * tabs over `/ws` (with the new unread count), and queues the email if they want that
 * category by email. In-app notifications cannot be switched off.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailQueue,
    private readonly realtime: RealtimeGateway,
  ) {}

  async notify(input: NotifyInput): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: input.userId, deletedAt: null },
      select: { id: true, notificationSettings: true },
    });
    if (!user) return;
    const payload: Payload = { title: input.title, body: input.body, link: input.link ?? null };
    const row = await this.prisma.notification.create({
      data: { userId: user.id, type: input.type, payload: payload as unknown as Prisma.InputJsonValue },
    });
    this.realtime.emitToUser(user.id, WS_EVENTS.notification, toItem(row));
    this.realtime.emitToUser(user.id, WS_EVENTS.unreadCount, { count: await this.unreadCount(user.id) });

    const category = NOTIFICATION_TYPES[input.type];
    if (input.email && (input.alwaysEmail || emailPreferences(user.notificationSettings)[category])) {
      await this.emails.send(input.email);
      await this.prisma.notification.update({ where: { id: row.id }, data: { sentAt: new Date() } });
    }
  }

  async list(user: AuthUser, q: z.output<typeof notificationsQuerySchema>): Promise<Paginated<NotificationItem>> {
    const where: Prisma.NotificationWhereInput = { userId: user.id, readAt: q.unread ? null : undefined };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.notification.count({ where }),
    ]);
    return { data: rows.map(toItem), meta: { page: q.page, limit: q.limit, total } };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(user: AuthUser, id: string): Promise<NotificationItem> {
    const row = await this.prisma.notification.findFirst({ where: { id, userId: user.id } });
    if (!row) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Notification not found');
    const updated = row.readAt ? row : await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    this.realtime.emitToUser(user.id, WS_EVENTS.unreadCount, { count: await this.unreadCount(user.id) });
    return toItem(updated);
  }

  async markAllRead(user: AuthUser): Promise<{ updated: number }> {
    const { count } = await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    this.realtime.emitToUser(user.id, WS_EVENTS.unreadCount, { count: 0 });
    return { updated: count };
  }

  async preferences(user: AuthUser): Promise<NotificationPreferences> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { notificationSettings: true } });
    return { email: emailPreferences(u.notificationSettings) };
  }

  /** Merges: categories left out of the request keep their current setting. */
  async updatePreferences(user: AuthUser, input: { email: Partial<Record<NotificationCategory, boolean>> }): Promise<NotificationPreferences> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { notificationSettings: true } });
    const settings = (u.notificationSettings as Record<string, unknown> | null) ?? {};
    const email = { ...emailPreferences(u.notificationSettings), ...input.email };
    await this.prisma.user.update({ where: { id: user.id }, data: { notificationSettings: { ...settings, email } as Prisma.InputJsonValue } });
    return { email };
  }
}

function toItem(row: { id: string; type: string; payload: Prisma.JsonValue; readAt: Date | null; createdAt: Date }): NotificationItem {
  const p = row.payload as unknown as Payload;
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: p.title,
    body: p.body,
    link: p.link,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}
