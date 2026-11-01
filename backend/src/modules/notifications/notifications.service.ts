import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  APP_NAME,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
  SMS_CATEGORIES,
  WS_EVENTS,
  type NotificationCategory,
  type NotificationItem,
  type NotificationPreferences,
  type notificationPreferencesSchema,
  type notificationsQuerySchema,
  type NotificationType,
  type Paginated,
  type SmsCategory,
  type SmsChannel,
} from '@edu-forum/shared';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { ApiException } from '../../common/filters/api-exception.filter';
import type { Prisma } from '../../generated/prisma/client';
import { EmailQueue } from '../../infra/mail/email-queue';
import type { MailMessage } from '../../infra/mail/mailer';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SmsQueue } from '../../infra/sms/sms-queue';
import { PushService } from '../push/push.module';
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
  /** Important alerts that may also go by SMS/WhatsApp, if the user switched this category on. */
  smsCategory?: SmsCategory;
}

interface Payload {
  title: string;
  body: string;
  link: string | null;
}

/** Stored under users.notification_settings as `{ email: { <category>: boolean } }`; missing = on. */
/** SMS/WhatsApp are opt-in: missing = off. */
const smsPreferences = (settings: Prisma.JsonValue): Record<SmsCategory, boolean> => {
  const stored = (settings as { sms?: Partial<Record<SmsCategory, boolean>> } | null)?.sms ?? {};
  return Object.fromEntries(SMS_CATEGORIES.map((c) => [c, stored[c] === true])) as Record<SmsCategory, boolean>;
};
const smsChannel = (settings: Prisma.JsonValue): SmsChannel => ((settings as { smsChannel?: SmsChannel } | null)?.smsChannel === 'whatsapp' ? 'whatsapp' : 'sms');

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
    private readonly push: PushService,
    private readonly sms: SmsQueue,
    private readonly config: ConfigService,
  ) {}

  async notify(input: NotifyInput): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: input.userId, deletedAt: null },
      select: { id: true, notificationSettings: true, phone: true, phoneVerifiedAt: true, status: true },
    });
    if (!user) return;
    const payload: Payload = { title: input.title, body: input.body, link: input.link ?? null };
    const row = await this.prisma.notification.create({
      data: { userId: user.id, type: input.type, payload: payload as unknown as Prisma.InputJsonValue },
    });
    this.realtime.emitToUser(user.id, WS_EVENTS.notification, toItem(row));
    this.realtime.emitToUser(user.id, WS_EVENTS.unreadCount, { count: await this.unreadCount(user.id) });
    // Also to each phone or browser the user allowed (PWA push alerts).
    await this.push.sendToUser(user.id, { title: input.title, body: input.body, link: input.link ?? null, tag: input.type });

    // Important alerts by SMS/WhatsApp: opt-in, to a confirmed phone only (texts cost money).
    if (input.smsCategory && user.phone && user.phoneVerifiedAt && user.status === 'active' && smsPreferences(user.notificationSettings)[input.smsCategory]) {
      const link = input.link ? ` ${this.config.getOrThrow<string>('APP_URL')}${input.link}` : '';
      // One SMS page (160 characters): the title and as much detail (e.g. the interview time) as fits, then the link.
      const words = `${APP_NAME}: ${input.title}. ${input.body}`;
      const room = 160 - link.length;
      const text = (words.length > room ? `${words.slice(0, room - 1).trimEnd()}…` : words) + link;
      const channel = smsChannel(user.notificationSettings) === 'whatsapp' && this.whatsappAvailable() ? 'whatsapp' : 'sms';
      await this.sms.send({ to: user.phone, text, channel });
    }

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
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { notificationSettings: true, phone: true, phoneVerifiedAt: true } });
    return this.toPreferences(u);
  }

  /** Merges: categories left out of the request keep their current setting. */
  async updatePreferences(user: AuthUser, input: z.output<typeof notificationPreferencesSchema>): Promise<NotificationPreferences> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { notificationSettings: true, phone: true, phoneVerifiedAt: true } });
    const settings = (u.notificationSettings as Record<string, unknown> | null) ?? {};
    const next = {
      ...settings,
      email: { ...emailPreferences(u.notificationSettings), ...input.email },
      sms: { ...smsPreferences(u.notificationSettings), ...input.sms },
      smsChannel: input.smsChannel ?? smsChannel(u.notificationSettings),
    };
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { notificationSettings: next as Prisma.InputJsonValue },
      select: { notificationSettings: true, phone: true, phoneVerifiedAt: true },
    });
    return this.toPreferences(updated);
  }

  private toPreferences(u: { notificationSettings: Prisma.JsonValue; phone: string | null; phoneVerifiedAt: Date | null }): NotificationPreferences {
    return {
      email: emailPreferences(u.notificationSettings),
      sms: smsPreferences(u.notificationSettings),
      smsChannel: smsChannel(u.notificationSettings),
      phone: u.phone,
      phoneVerified: !!u.phoneVerifiedAt,
      // Console (local) prints texts to the API log, so it counts as available for trying it out.
      smsAvailable: true,
      whatsappAvailable: this.whatsappAvailable(),
    };
  }

  /** WhatsApp needs a Termii-approved sender in production; locally the console stands in. */
  private whatsappAvailable(): boolean {
    return this.config.get('SMS_DRIVER') !== 'termii' || this.config.get('TERMII_WHATSAPP') === 'true';
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
