import { z } from 'zod';

/**
 * Email categories a user can switch off (FR-9). In-app notifications are always on.
 * SMS/WhatsApp join in v1.1 (Termii).
 */
export const NOTIFICATION_CATEGORIES = ['applications', 'invitations', 'interviews', 'messages', 'alerts', 'reminders', 'community', 'blog'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  applications: 'Applications and status changes',
  invitations: 'Invitations to apply',
  interviews: 'Interviews',
  messages: 'New chat messages',
  alerts: 'Saved-search job alerts',
  reminders: 'Reminders (expiring vacancies, unfinished profile)',
  community: 'Comments on my community posts',
  blog: 'My blog posts (approval and comments)',
};

/** What triggered a notification; each belongs to one category. */
export const NOTIFICATION_TYPES = {
  new_application: 'applications',
  status_change: 'applications',
  application_withdrawn: 'applications',
  vacancy_changed: 'applications',
  invitation: 'invitations',
  invitation_reply: 'invitations',
  interview: 'interviews',
  message: 'messages',
  saved_search_match: 'alerts',
  vacancy_expiring: 'reminders',
  profile_incomplete: 'reminders',
  moderation: 'reminders',
  community_comment: 'community',
  blog_review: 'blog',
  blog_comment: 'blog',
} as const satisfies Record<string, NotificationCategory>;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** In-app link, e.g. "/teacher/applications". */
  link: string | null;
  read: boolean;
  createdAt: string;
}

/** GET/PUT /notifications/preferences */
/**
 * SMS / WhatsApp alerts (user, 2026-11-01): important alerts only, opt-in (texts cost money), to a
 * confirmed phone number. WhatsApp uses the same choices once Termii approves the sender.
 */
export const SMS_CATEGORIES = ['application_updates', 'interviews', 'invitations'] as const;
export type SmsCategory = (typeof SMS_CATEGORIES)[number];
export const SMS_CATEGORY_LABELS: Record<SmsCategory, string> = {
  application_updates: 'Shortlisted, offered a job or hired',
  interviews: 'Interviews booked, changed or coming up tomorrow',
  invitations: 'Invitations to apply',
};
export const SMS_CHANNELS = ['sms', 'whatsapp'] as const;
export type SmsChannel = (typeof SMS_CHANNELS)[number];

export const notificationPreferencesSchema = z.object({
  // partialRecord: send only the categories you change (z.record with an enum key needs all of them).
  email: z.partialRecord(z.enum(NOTIFICATION_CATEGORIES), z.boolean()).optional(),
  sms: z.partialRecord(z.enum(SMS_CATEGORIES), z.boolean()).optional(),
  smsChannel: z.enum(SMS_CHANNELS).optional(),
});
export type NotificationPreferences = {
  email: Record<NotificationCategory, boolean>;
  /** Off unless switched on. */
  sms: Record<SmsCategory, boolean>;
  smsChannel: SmsChannel;
  /** Texts go only to a confirmed phone number. */
  phone: string | null;
  phoneVerified: boolean;
  /** False when this server cannot send texts yet. */
  smsAvailable: boolean;
  whatsappAvailable: boolean;
};

export const notificationsQuerySchema = z.object({
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Events on the `/ws` Socket.IO connection. */
export const WS_EVENTS = {
  notification: 'notification',
  unreadCount: 'notifications:unread',
  message: 'message',
  conversationRead: 'conversation:read',
  // Blocked or unblocked: refetch the conversation.
  conversationUpdated: 'conversation:updated',
} as const;
