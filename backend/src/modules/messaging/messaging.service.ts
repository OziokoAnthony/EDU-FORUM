import { HttpStatus, Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  APP_NAME,
  WS_EVENTS,
  type AttachmentLinkResponse,
  type AttachmentStatus,
  type ConversationItem,
  type conversationsQuerySchema,
  type MessageItem,
  type MessagesPage,
  type messagesQuerySchema,
  type Paginated,
  type sendMessageSchema,
  type startConversationSchema,
} from '@edu-forum/shared';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { ApiException } from '../../common/filters/api-exception.filter';
import type { Prisma, Upload } from '../../generated/prisma/client';
import { simpleEmail } from '../../infra/mail/simple-email';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RealtimeGateway } from '../../infra/realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadsService, type ScanOutcome } from '../uploads/uploads.service';

const notFound = () => new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Conversation not found');
const rule = (message: string) => new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', message);
const ROLE_NAME = { principal: 'Principal', director: 'Director' } as const;

const CONVERSATION_INCLUDE = {
  employer: { select: { id: true, role: true, email: true, deletedAt: true } },
  teacher: { select: { id: true, fullName: true, userId: true, user: { select: { email: true, deletedAt: true } } } },
} satisfies Prisma.ConversationInclude;
type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof CONVERSATION_INCLUDE }>;
type MessageRow = Prisma.MessageGetPayload<{ include: { attachmentUpload: { select: { scanStatus: true } } } }>;

const attachmentStatus = (m: MessageRow, override?: ScanOutcome): AttachmentStatus => {
  const status = override ?? m.attachmentUpload?.scanStatus;
  if (!m.attachmentKey || (status && status !== 'pending' && status !== 'clean')) return 'removed';
  return status === 'clean' ? 'ready' : 'scanning';
};

/**
 * FR-8 messaging. A principal/director opens a chat with any teacher (user, 2026-10-31);
 * teachers reply. Text and PDF/image attachments (5 MB, virus-scanned before anyone can open
 * them). Either side can block; while blocked nobody can send. Messages can be deleted by
 * their sender (shown as "Message deleted"), never edited. Live over `/ws`.
 */
@Injectable()
export class MessagingService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.uploads.onScanned('message_attachment', (upload, outcome) => this.scanned(upload, outcome));
  }

  /** Opens (or returns the existing) chat with a teacher. */
  async start(user: AuthUser, input: z.output<typeof startConversationSchema>): Promise<ConversationItem> {
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { id: input.teacherId, deletedAt: null, user: { status: 'active', deletedAt: null } },
      select: { id: true, isPublished: true, applications: { where: { vacancy: { createdById: user.id } }, select: { id: true }, take: 1 } },
    });
    // Teachers you can see: published profiles, or anyone who applied to your vacancies.
    if (!teacher || (!teacher.isPublished && teacher.applications.length === 0)) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Teacher not found');
    if (input.applicationId) {
      const own = await this.prisma.application.findFirst({ where: { id: input.applicationId, teacherId: teacher.id, vacancy: { createdById: user.id } }, select: { id: true } });
      if (!own) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Application not found');
    }
    const existing = await this.prisma.conversation.findUnique({ where: { employerId_teacherId: { employerId: user.id, teacherId: teacher.id } } });
    if (existing?.blockedById && existing.blockedById !== user.id) throw rule('This teacher is not accepting messages from you');
    const row = existing
      ? existing.deletedAt || (input.applicationId && !existing.applicationId)
        ? await this.prisma.conversation.update({ where: { id: existing.id }, data: { deletedAt: null, applicationId: existing.applicationId ?? input.applicationId } })
        : existing
      : await this.prisma.conversation
          .create({ data: { employerId: user.id, teacherId: teacher.id, applicationId: input.applicationId ?? null } })
          // Two tabs starting the same chat: the unique index decides, then we read the winner.
          .catch(() => this.prisma.conversation.findUniqueOrThrow({ where: { employerId_teacherId: { employerId: user.id, teacherId: teacher.id } } }));
    return this.conversationItem(user, row.id);
  }

  async list(user: AuthUser, q: z.output<typeof conversationsQuerySchema>): Promise<Paginated<ConversationItem>> {
    const where: Prisma.ConversationWhereInput = { deletedAt: null, ...this.participant(user) };
    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: { id: true },
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return { data: await Promise.all(rows.map((r) => this.conversationItem(user, r.id))), meta: { page: q.page, limit: q.limit, total } };
  }

  async get(user: AuthUser, id: string): Promise<ConversationItem> {
    await this.own(user, id);
    return this.conversationItem(user, id);
  }

  /** Cursor pagination, newest page first; each page is returned oldest-first. */
  async messages(user: AuthUser, id: string, q: z.output<typeof messagesQuerySchema>): Promise<MessagesPage> {
    await this.own(user, id);
    let before: { createdAt: Date; id: string } | null = null;
    if (q.before) {
      before = await this.prisma.message.findFirst({ where: { id: q.before, conversationId: id }, select: { createdAt: true, id: true } });
      if (!before) throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Unknown cursor');
    }
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId: id,
        ...(before ? { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] } : {}),
      },
      include: { attachmentUpload: { select: { scanStatus: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const more = rows.length > q.limit;
    const page = rows.slice(0, q.limit);
    return { data: page.reverse().map((m) => this.messageItem(user, m)), nextBefore: more ? page[0].id : null };
  }

  async send(user: AuthUser, id: string, input: z.output<typeof sendMessageSchema>): Promise<MessageItem> {
    const c = await this.own(user, id);
    if (c.blockedById) throw rule(c.blockedById === user.id ? 'Unblock this chat to send messages' : 'You cannot send messages in this chat');
    const other = this.otherUserId(user, c);
    if (c.employer.deletedAt || c.teacher.user.deletedAt) throw rule('This account has been deleted');
    // Teachers reply; they never open chats, but they can write once one exists.

    let upload: Upload | null = null;
    if (input.uploadId) upload = await this.uploads.claim(user.id, input.uploadId, 'message_attachment');
    const message = await this.prisma.message.create({
      data: {
        conversationId: id,
        senderId: user.id,
        body: input.body ?? null,
        attachmentKey: upload?.objectKey ?? null,
        attachmentName: upload?.fileName ?? null,
        attachmentMime: upload?.mimeType ?? null,
        attachmentSize: upload?.sizeBytes ?? null,
        attachmentUploadId: upload?.id ?? null,
      },
      include: { attachmentUpload: { select: { scanStatus: true } } },
    });
    await this.prisma.conversation.update({ where: { id }, data: { lastMessageAt: message.createdAt, deletedAt: null } });
    if (upload) await this.uploads.enqueueScan(upload.id);

    const fresh = await this.prisma.message.findUniqueOrThrow({ where: { id: message.id }, include: { attachmentUpload: { select: { scanStatus: true } } } });
    this.push(c, fresh);
    await this.notifyRecipient(user, c, other, fresh);
    return this.messageItem(user, fresh);
  }

  /** Marks the other side's messages read ("Seen") and tells them live. */
  async markRead(user: AuthUser, id: string): Promise<{ updated: number }> {
    const c = await this.own(user, id);
    const readAt = new Date();
    const { count } = await this.prisma.message.updateMany({ where: { conversationId: id, senderId: { not: user.id }, readAt: null }, data: { readAt } });
    if (count > 0) this.realtime.emitToUser(this.otherUserId(user, c), WS_EVENTS.conversationRead, { conversationId: id, readAt: readAt.toISOString() });
    return { updated: count };
  }

  async block(user: AuthUser, id: string): Promise<ConversationItem> {
    const c = await this.own(user, id);
    if (c.blockedById && c.blockedById !== user.id) throw rule('This chat is already closed');
    if (!c.blockedById) await this.prisma.conversation.update({ where: { id }, data: { blockedById: user.id, blockedAt: new Date() } });
    this.realtime.emitToUser(this.otherUserId(user, c), WS_EVENTS.conversationUpdated, { conversationId: id });
    return this.conversationItem(user, id);
  }

  /** Only whoever blocked can unblock. */
  async unblock(user: AuthUser, id: string): Promise<ConversationItem> {
    const c = await this.own(user, id);
    if (c.blockedById !== user.id) throw rule('You have not blocked this chat');
    await this.prisma.conversation.update({ where: { id }, data: { blockedById: null, blockedAt: null } });
    this.realtime.emitToUser(this.otherUserId(user, c), WS_EVENTS.conversationUpdated, { conversationId: id });
    return this.conversationItem(user, id);
  }

  /** The sender deletes their own message: text and file are erased, a placeholder stays. */
  async deleteMessage(user: AuthUser, id: string, messageId: string): Promise<MessageItem> {
    const c = await this.own(user, id);
    const m = await this.prisma.message.findFirst({ where: { id: messageId, conversationId: id } });
    if (!m) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Message not found');
    if (m.senderId !== user.id) throw new ApiException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You can only delete your own messages');
    if (m.attachmentKey) await this.uploads.deleteObject(m.attachmentKey).catch(() => undefined);
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: m.deletedAt ?? new Date(), body: null, attachmentKey: null },
      include: { attachmentUpload: { select: { scanStatus: true } } },
    });
    this.push(c, updated);
    return this.messageItem(user, updated);
  }

  /** 10-minute link to a clean attachment, for either participant. */
  async attachmentLink(user: AuthUser, id: string, messageId: string): Promise<AttachmentLinkResponse> {
    await this.own(user, id);
    const m = await this.prisma.message.findFirst({ where: { id: messageId, conversationId: id, deletedAt: null }, include: { attachmentUpload: { select: { scanStatus: true } } } });
    if (!m?.attachmentKey) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Attachment not found');
    const status = attachmentStatus(m);
    if (status !== 'ready') throw rule(status === 'scanning' ? 'The file is still being checked for viruses. Try again in a moment.' : 'This file was removed');
    const ttl = this.config.getOrThrow<number>('SIGNED_URL_TTL_SECONDS');
    return {
      url: await this.uploads.signedUrl(m.attachmentKey, { downloadName: m.attachmentName ?? 'attachment', contentType: m.attachmentMime ?? undefined }),
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  // ───────────── helpers ─────────────

  /** Scan result: infected or failed files are removed; both sides see the new state live. */
  private async scanned(upload: Upload, outcome: ScanOutcome): Promise<void> {
    const m = await this.prisma.message.findUnique({
      where: { attachmentUploadId: upload.id },
      include: { attachmentUpload: { select: { scanStatus: true } }, conversation: { include: CONVERSATION_INCLUDE } },
    });
    if (!m) return;
    if (outcome !== 'clean') await this.prisma.message.update({ where: { id: m.id }, data: { attachmentKey: null } });
    const after = outcome === 'clean' ? m : { ...m, attachmentKey: null };
    for (const userId of [m.conversation.employerId, m.conversation.teacher.userId]) {
      this.realtime.emitToUser(userId, WS_EVENTS.message, this.messageItem({ id: userId } as AuthUser, after, outcome));
    }
  }

  private participant(user: AuthUser): Prisma.ConversationWhereInput {
    return user.role === 'teacher' ? { teacher: { userId: user.id } } : { employerId: user.id };
  }

  private async own(user: AuthUser, id: string): Promise<ConversationRow> {
    const c = await this.prisma.conversation.findFirst({ where: { id, ...this.participant(user) }, include: CONVERSATION_INCLUDE });
    if (!c) throw notFound();
    return c;
  }

  private otherUserId(user: AuthUser, c: ConversationRow): string {
    return user.id === c.employerId ? c.teacher.userId : c.employerId;
  }

  private push(c: ConversationRow, m: MessageRow): void {
    for (const userId of [c.employerId, c.teacher.userId]) {
      this.realtime.emitToUser(userId, WS_EVENTS.message, this.messageItem({ id: userId } as AuthUser, m));
    }
  }

  /** One notice per unread run: only the first unread message notifies (and emails). */
  private async notifyRecipient(user: AuthUser, c: ConversationRow, recipientId: string, m: MessageRow): Promise<void> {
    const unread = await this.prisma.message.count({ where: { conversationId: c.id, senderId: user.id, readAt: null, deletedAt: null } });
    if (unread > 1) return;
    const fromTeacher = user.id === c.teacher.userId;
    const sender = fromTeacher ? (c.teacher.fullName ?? 'A teacher') : `A ${ROLE_NAME[c.employer.role as keyof typeof ROLE_NAME]?.toLowerCase() ?? 'school leader'}`;
    const preview = m.body ? (m.body.length > 140 ? `${m.body.slice(0, 140)}…` : m.body) : `Sent a file: ${m.attachmentName}`;
    const link = fromTeacher ? `/hiring/messages/${c.id}` : `/teacher/messages/${c.id}`;
    const email = fromTeacher ? c.employer.email : c.teacher.user.email;
    await this.notifications.notify({
      userId: recipientId,
      type: 'message',
      title: `New message from ${sender}`,
      body: preview,
      link,
      email: email
        ? simpleEmail(email, `New message from ${sender}`, [`${sender} sent you a message on ${APP_NAME}:`, preview], {
            url: `${this.config.getOrThrow<string>('APP_URL')}${link}`,
            text: 'Reply',
          })
        : undefined,
    });
  }

  private async conversationItem(user: AuthUser, id: string): Promise<ConversationItem> {
    const c = await this.prisma.conversation.findUniqueOrThrow({ where: { id }, include: CONVERSATION_INCLUDE });
    const [last, unread] = await Promise.all([
      this.prisma.message.findFirst({ where: { conversationId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      this.prisma.message.count({ where: { conversationId: id, senderId: { not: user.id }, readAt: null, deletedAt: null } }),
    ]);
    const amTeacher = user.id === c.teacher.userId;
    const other = amTeacher
      ? {
          name: c.employer.deletedAt ? 'Deleted user' : ROLE_NAME[c.employer.role as keyof typeof ROLE_NAME] ?? 'School leader',
          role: c.employer.role as 'principal' | 'director',
          teacherId: null,
          deleted: !!c.employer.deletedAt,
        }
      : { name: c.teacher.user.deletedAt ? 'Deleted teacher' : (c.teacher.fullName ?? 'Teacher'), role: 'teacher' as const, teacherId: c.teacher.id, deleted: !!c.teacher.user.deletedAt };
    return {
      id: c.id,
      other,
      applicationId: c.applicationId,
      lastMessage: last
        ? {
            preview: last.deletedAt ? 'Message deleted' : (last.body ?? `📎 ${last.attachmentName ?? 'File'}`).slice(0, 120),
            mine: last.senderId === user.id,
            at: last.createdAt.toISOString(),
          }
        : null,
      unread,
      blocked: c.blockedById ? (c.blockedById === user.id ? 'me' : 'them') : null,
      createdAt: c.createdAt.toISOString(),
    };
  }

  private messageItem(viewer: Pick<AuthUser, 'id'>, m: MessageRow, override?: ScanOutcome): MessageItem {
    const deleted = !!m.deletedAt;
    return {
      id: m.id,
      conversationId: m.conversationId,
      mine: m.senderId === viewer.id,
      body: deleted ? null : m.body,
      attachment:
        !deleted && m.attachmentName
          ? { name: m.attachmentName, mimeType: m.attachmentMime ?? '', sizeBytes: m.attachmentSize ?? 0, status: attachmentStatus(m, override) }
          : null,
      deleted,
      readAt: m.readAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    };
  }
}
