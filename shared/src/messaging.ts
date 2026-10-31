import { z } from 'zod';

export const MESSAGE_MAX_CHARS = 4000;
export const MESSAGES_PAGE_SIZE = 30;

/** POST /conversations (principals and directors only; teachers reply). */
export const startConversationSchema = z.object({
  /** The teacher profile id. */
  teacherId: z.uuid(),
  /** Optional: the application the chat is about. */
  applicationId: z.uuid().optional(),
});

/** POST /conversations/:id/messages: text, an attachment, or both. */
export const sendMessageSchema = z
  .object({
    body: z
      .string()
      .trim()
      .max(MESSAGE_MAX_CHARS, `Keep messages under ${MESSAGE_MAX_CHARS.toLocaleString('en-NG')} characters`)
      .optional()
      .transform((v) => (v ? v : undefined)),
    uploadId: z.uuid().optional(),
  })
  .refine((v) => v.body !== undefined || v.uploadId !== undefined, { message: 'Write a message or attach a file', path: ['body'] });
export type SendMessageInput = z.input<typeof sendMessageSchema>;

export const messagesQuerySchema = z.object({
  /** Message id: returns messages older than this one. */
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(MESSAGES_PAGE_SIZE),
});

export const conversationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type AttachmentStatus = 'scanning' | 'ready' | 'removed';

export interface MessageItem {
  id: string;
  conversationId: string;
  /** True when the signed-in user sent it. */
  mine: boolean;
  /** Null when deleted. */
  body: string | null;
  attachment: { name: string; mimeType: string; sizeBytes: number; status: AttachmentStatus } | null;
  deleted: boolean;
  /** When the other side read it ("Seen"). */
  readAt: string | null;
  createdAt: string;
}

export interface ConversationItem {
  id: string;
  /** The person on the other side. */
  other: { name: string; role: 'teacher' | 'principal' | 'director'; teacherId: string | null; deleted: boolean };
  applicationId: string | null;
  lastMessage: { preview: string; mine: boolean; at: string } | null;
  unread: number;
  /** "me" = I blocked them; "them" = they blocked me; null = open. */
  blocked: 'me' | 'them' | null;
  createdAt: string;
}

export interface MessagesPage {
  /** Oldest first within the page. */
  data: MessageItem[];
  /** Pass as `before` to load older messages; null when there are none. */
  nextBefore: string | null;
}

export interface AttachmentLinkResponse {
  url: string;
  expiresAt: string;
}
