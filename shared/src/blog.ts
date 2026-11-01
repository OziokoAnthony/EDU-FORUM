import { z } from 'zod';
import { APP_NAME } from './app';
import { containsPhoneNumber } from './community';

/**
 * Blog (user, 2026-11-01; replaces the PRD's admin-only CMS): any registered teacher, principal
 * or director writes; an admin approves before the post goes public. Everyone sees comments and
 * likes; only registered users like and comment. The community rules apply.
 */
export const BLOG_PAGE_SIZE = 12;
export const BLOG_TITLE_MIN = 10;
export const BLOG_TITLE_MAX = 120;
export const BLOG_EXCERPT_MAX = 300;
export const BLOG_META_TITLE_MAX = 70;
export const BLOG_META_DESCRIPTION_MAX = 160;
/** Visible characters a post needs before it can be sent for approval (drafts can be shorter). */
export const BLOG_BODY_MIN_CHARS = 300;
export const BLOG_BODY_MAX_HTML = 100_000;
export const BLOG_COMMENT_MAX_CHARS = 1000;
export const BLOG_RELATED = 3;

export const BLOG_STATUSES = ['draft', 'pending', 'published', 'rejected'] as const;
export type BlogStatus = (typeof BLOG_STATUSES)[number];
export const BLOG_STATUS_LABELS: Record<BlogStatus, string> = {
  draft: 'Draft',
  pending: 'Waiting for approval',
  published: 'Published',
  rejected: 'Not approved',
};

/** Visible text of editor HTML (tags removed, entities for spaces decoded, whitespace squeezed). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/blockquote)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const PHONE_MESSAGE = 'Please do not share phone numbers on the blog. Use chat instead.';
const noPhone = <T extends z.ZodString>(s: T) => s.refine((v) => !containsPhoneNumber(htmlToText(v)), PHONE_MESSAGE);
const optionalText = (max: number, label: string) =>
  noPhone(z.string().trim().max(max, `${label} must be ${max} characters or fewer`))
    .transform((v) => (v === '' ? null : v))
    .nullable();

const postFields = {
  title: noPhone(z.string().trim().min(BLOG_TITLE_MIN, `The title needs at least ${BLOG_TITLE_MIN} characters`).max(BLOG_TITLE_MAX, `The title must be ${BLOG_TITLE_MAX} characters or fewer`)),
  /** Editor HTML; cleaned on the server. */
  body: noPhone(z.string().max(BLOG_BODY_MAX_HTML, 'The post is too long')),
  category: z.string().trim().min(1).max(80).nullable(),
  excerpt: optionalText(BLOG_EXCERPT_MAX, 'The summary'),
  /** A `post_cover` upload; null removes the cover. */
  coverUploadId: z.uuid().nullable(),
  metaTitle: optionalText(BLOG_META_TITLE_MAX, 'The search title'),
  metaDescription: optionalText(BLOG_META_DESCRIPTION_MAX, 'The search description'),
};

/** POST /posts — a new draft (only the title is required to save). */
export const createBlogPostSchema = z.object({
  title: postFields.title,
  body: postFields.body.default(''),
  category: postFields.category.optional(),
  excerpt: postFields.excerpt.optional(),
  coverUploadId: postFields.coverUploadId.optional(),
  metaTitle: postFields.metaTitle.optional(),
  metaDescription: postFields.metaDescription.optional(),
});
export type CreateBlogPostInput = z.input<typeof createBlogPostSchema>;

/** PATCH /posts/:id — no defaults (CLAUDE.md: edit schemas never carry `.default()`). */
export const updateBlogPostSchema = z.object(postFields).partial();
export type UpdateBlogPostInput = z.input<typeof updateBlogPostSchema>;

export const blogListQuerySchema = z.object({
  category: z.string().trim().min(1).max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(BLOG_PAGE_SIZE),
});

export const blogCommentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

export const adminBlogQuerySchema = z.object({
  status: z.enum(BLOG_STATUSES).default('pending'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const createBlogCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write a comment')
    .max(BLOG_COMMENT_MAX_CHARS, `A comment must be ${BLOG_COMMENT_MAX_CHARS.toLocaleString('en-NG')} characters or fewer`)
    .refine((v) => !containsPhoneNumber(v), PHONE_MESSAGE),
});
export type CreateBlogCommentInput = z.input<typeof createBlogCommentSchema>;

export interface BlogCategoryItem {
  slug: string;
  name: string;
}

/** Teachers by name; principals and directors (no profile) by role, as in the community. */
export interface BlogAuthor {
  name: string;
  role: 'teacher' | 'principal' | 'director' | 'admin';
}

export interface BlogPostListItem {
  id: string;
  slug: string;
  /** Public page, e.g. /blog/how-to-pass-waec-physics. */
  path: string;
  title: string;
  excerpt: string;
  category: BlogCategoryItem | null;
  /** True when the post has a scanned cover photo, served from GET /posts/:id/cover. */
  hasCover: boolean;
  author: BlogAuthor;
  publishedAt: string;
  updatedAt: string;
  likes: number;
  comments: number;
}

/** GET /posts/by-slug/:slug */
export interface BlogPostDetail extends BlogPostListItem {
  /** Cleaned HTML. */
  body: string;
  metaTitle: string | null;
  metaDescription: string | null;
  /** Only with a signed-in viewer. */
  likedByMe: boolean;
  related: BlogPostListItem[];
}

/** The writer's own view (any status). */
export interface MyBlogPost {
  id: string;
  title: string;
  status: BlogStatus;
  /** Admin's reason when not approved. */
  reviewNote: string | null;
  /** Admin's reason when taken down after publishing. */
  removedReason: string | null;
  /** Public page once approved; null before. */
  path: string | null;
  category: string | null;
  excerpt: string | null;
  body: string;
  coverUploadId: string | null;
  /** 10-minute link to the cover once scanned clean. */
  coverUrl: string | null;
  coverStatus: 'none' | 'scanning' | 'ready';
  metaTitle: string | null;
  metaDescription: string | null;
  submittedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  likes: number;
  comments: number;
}

/** Admin review list. */
export interface AdminBlogPostItem extends MyBlogPost {
  author: BlogAuthor & { email: string | null };
}

export interface BlogCommentItem {
  id: string;
  author: BlogAuthor;
  mine: boolean;
  body: string;
  likes: number;
  likedByMe: boolean;
  createdAt: string;
}

export function blogPath(slug: string): string {
  return `/blog/${slug}`;
}

/** Article JSON-LD for a published post (CLAUDE.md: `Article` on posts). */
export function articleJsonLd(p: Pick<BlogPostDetail, 'title' | 'excerpt' | 'path' | 'publishedAt' | 'updatedAt' | 'author' | 'hasCover' | 'id'>, siteUrl: string, coverUrl?: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: p.title.slice(0, 110),
    description: p.excerpt,
    datePublished: p.publishedAt,
    dateModified: p.updatedAt,
    mainEntityOfPage: `${siteUrl}${p.path}`,
    ...(p.hasCover && coverUrl ? { image: [coverUrl] } : {}),
    author: { '@type': 'Person', name: p.author.name },
    publisher: { '@type': 'Organization', name: APP_NAME, url: siteUrl },
  };
}
