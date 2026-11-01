import { z } from 'zod';

/** Community feed limits (confirmed 2026-11-01). */
export const COMMUNITY_POST_MAX_CHARS = 2000;
export const COMMUNITY_COMMENT_MAX_CHARS = 1000;
export const COMMUNITY_MAX_PHOTOS = 4;
export const COMMUNITY_PAGE_SIZE = 20;

/**
 * Phone numbers are not allowed in posts or comments (CLAUDE.md: contact stays inside the
 * platform). Matches Nigerian numbers written as 080…, +234…, 234…, with spaces or dashes.
 */
const PHONE = /(?:\+?234|0)[\s-]?[789][01](?:[\s-]?\d){8}\b/;
export function containsPhoneNumber(text: string): boolean {
  return PHONE.test(text);
}
const PHONE_MESSAGE = 'Please do not share phone numbers in the community. Use chat instead.';

const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max.toLocaleString('en-NG')} characters or fewer`)
    .refine((v) => !containsPhoneNumber(v), PHONE_MESSAGE);

/** POST /community/posts — text, and/or photos, and/or a shared job. */
export const createPostSchema = z
  .object({
    body: text(COMMUNITY_POST_MAX_CHARS, 'A post').default(''),
    tag: z.string().trim().min(1).max(80).optional(),
    uploadIds: z.array(z.uuid()).max(COMMUNITY_MAX_PHOTOS, `Add up to ${COMMUNITY_MAX_PHOTOS} photos`).default([]),
    vacancyId: z.uuid().optional(),
    /** Share (repost) another community post; sharing a share shares the original. */
    sharedPostId: z.uuid().optional(),
  })
  .refine((v) => v.body.length > 0 || v.uploadIds.length > 0 || !!v.vacancyId || !!v.sharedPostId, {
    path: ['body'],
    message: 'Write something, add a photo or share a job',
  });
export type CreatePostInput = z.input<typeof createPostSchema>;

export const createCommentSchema = z.object({
  body: text(COMMUNITY_COMMENT_MAX_CHARS, 'A comment').pipe(z.string().min(1, 'Write a comment')),
});
export type CreateCommentInput = z.input<typeof createCommentSchema>;

export const feedQuerySchema = z.object({
  tag: z.string().trim().min(1).max(80).optional(),
  /** Cursor: the id of the oldest post already shown. */
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(COMMUNITY_PAGE_SIZE),
});

export const commentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const blockUserSchema = z.object({ userId: z.uuid() });

export interface CommunityTagItem {
  slug: string;
  name: string;
}

/** Teachers appear by name; principals and directors (no profile) by role. */
export interface CommunityAuthor {
  userId: string;
  name: string;
  role: 'teacher' | 'principal' | 'director';
  photoUrl: string | null;
  /** Teacher profile id, for principals/directors to open the profile; null otherwise. */
  teacherId: string | null;
}

export interface CommunityPhotoItem {
  id: string;
  /** 10-minute link once the virus scan is clean; null while scanning. */
  url: string | null;
  status: 'scanning' | 'ready';
}

/** A shared job, through the public serializer (anonymous schools stay hidden). */
export interface CommunitySharedJob {
  id: string;
  title: string;
  schoolLabel: string;
  place: string;
  salary: { min: number; max: number; currency: string; period: string };
  /** Public job page, e.g. /jobs/ss2-physics-teacher-ikeja-abc23def. */
  path: string;
  open: boolean;
}

/** The original post inside a share; `available: false` once it was deleted or removed. */
export type CommunitySharedPost =
  | { available: true; id: string; author: CommunityAuthor; body: string; tag: CommunityTagItem | null; photos: CommunityPhotoItem[]; job: CommunitySharedJob | null; createdAt: string }
  | { available: false; id: string };

export interface CommunityPostItem {
  id: string;
  author: CommunityAuthor;
  mine: boolean;
  body: string;
  tag: CommunityTagItem | null;
  photos: CommunityPhotoItem[];
  job: CommunitySharedJob | null;
  shared: CommunitySharedPost | null;
  likes: number;
  likedByMe: boolean;
  comments: number;
  shares: number;
  createdAt: string;
}

export interface CommunityCommentItem {
  id: string;
  postId: string;
  author: CommunityAuthor;
  mine: boolean;
  body: string;
  likes: number;
  likedByMe: boolean;
  createdAt: string;
}

export interface CommunityFeedPage {
  data: CommunityPostItem[];
  /** Pass as `before` for the next page; null at the end. */
  nextBefore: string | null;
}

export interface LikeResponse {
  likes: number;
  likedByMe: boolean;
}

/** Live events (to every signed-in teacher, principal and director). */
export const COMMUNITY_WS_EVENTS = {
  newPost: 'community:post',
  postUpdated: 'community:post-updated',
  postRemoved: 'community:post-removed',
  newComment: 'community:comment',
} as const;
export interface CommunityPostUpdate {
  postId: string;
  likes: number;
  comments: number;
  shares: number;
}
