import { HttpStatus, Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  APP_NAME,
  BLOG_BODY_MIN_CHARS,
  BLOG_RELATED,
  blogPath,
  htmlToText,
  slugify,
  type adminBlogQuerySchema,
  type AdminBlogPostItem,
  type BlogAuthor,
  type BlogCategoryItem,
  type blogCommentsQuerySchema,
  type BlogCommentItem,
  type blogListQuerySchema,
  type BlogPostDetail,
  type BlogPostListItem,
  type createBlogCommentSchema,
  type createBlogPostSchema,
  type LikeResponse,
  type MyBlogPost,
  type Paginated,
  type updateBlogPostSchema,
} from '@edu-forum/shared';
import sanitizeHtml from 'sanitize-html';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { AVAILABLE_USER } from '../../common/available-user';
import { ApiException } from '../../common/filters/api-exception.filter';
import { Prisma, type Upload } from '../../generated/prisma/client';
import { simpleEmail } from '../../infra/mail/simple-email';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SeoNotifier } from '../seo/seo-notifier';
import { UploadsService, type ScanOutcome } from '../uploads/uploads.service';

const notFound = (what = 'Post') => new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`);
const rule = (message: string, details?: Record<string, unknown>) => new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', message, details);
const invalid = (path: string, message: string) => new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Validation failed', { issues: [{ path, message }] });

const AUTHOR_SELECT = { id: true, role: true, email: true, teacherProfile: { select: { fullName: true } } } satisfies Prisma.UserSelect;
type AuthorRow = Prisma.UserGetPayload<{ select: typeof AUTHOR_SELECT }>;
const POST_INCLUDE = { author: { select: AUTHOR_SELECT }, coverUpload: { select: { scanStatus: true } } } satisfies Prisma.PostInclude;
type PostRow = Prisma.PostGetPayload<{ include: typeof POST_INCLUDE }>;

/** Public: approved, not taken down or deleted, author still around. */
const PUBLIC = { status: 'published', deletedAt: null, removedReason: null, slug: { not: null }, author: AVAILABLE_USER } satisfies Prisma.PostWhereInput;

/** Blog bodies: simple formatting and links only (no images, scripts or styles). */
function cleanBody(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote', 'a'],
    allowedAttributes: { a: ['href', 'rel', 'target'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'nofollow noopener noreferrer ugc', target: '_blank' }) },
  }).trim();
}

const excerptOf = (row: { excerpt: string | null; body: string }) => {
  if (row.excerpt) return row.excerpt;
  const text = htmlToText(row.body).replace(/\s+/g, ' ');
  return text.length > 200 ? `${text.slice(0, 197).trimEnd()}…` : text;
};

/**
 * Blog (user, 2026-11-01): any registered teacher, principal or director writes; an admin
 * approves (public, in the sitemap) or rejects with a reason. Admins' own posts publish
 * directly. Editing a published post sends it back for approval and takes it offline until
 * then (the slug never changes). Everyone reads posts, comments and like counts; only
 * registered users like and comment. Phone numbers are blocked; report, admin removal and
 * community blocks (both ways) apply to comments.
 */
@Injectable()
export class BlogService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly notifications: NotificationsService,
    private readonly seo: SeoNotifier,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.uploads.onScanned('post_cover', (upload, outcome) => this.coverScanned(upload, outcome));
  }

  async categories(): Promise<BlogCategoryItem[]> {
    const rows = await this.prisma.blogCategory.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map((c) => ({ slug: c.slug, name: c.name }));
  }

  // ───────────── public ─────────────

  async list(q: z.output<typeof blogListQuerySchema>): Promise<Paginated<BlogPostListItem>> {
    const where: Prisma.PostWhereInput = { ...PUBLIC, category: q.category };
    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({ where, include: POST_INCLUDE, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.post.count({ where }),
    ]);
    const cats = await this.categoryNames();
    return { data: rows.map((r) => this.listItem(r, cats)), meta: { page: q.page, limit: q.limit, total } };
  }

  async bySlug(viewer: AuthUser | undefined, slug: string): Promise<BlogPostDetail> {
    const row = await this.prisma.post.findFirst({ where: { ...PUBLIC, slug }, include: POST_INCLUDE });
    if (!row) throw notFound();
    const cats = await this.categoryNames();
    // Related: same category first, then the newest others.
    const related = await this.prisma.post.findMany({
      where: { ...PUBLIC, id: { not: row.id }, ...(row.category ? { category: row.category } : {}) },
      include: POST_INCLUDE,
      orderBy: { publishedAt: 'desc' },
      take: BLOG_RELATED,
    });
    if (related.length < BLOG_RELATED && row.category) {
      related.push(
        ...(await this.prisma.post.findMany({
          where: { ...PUBLIC, id: { notIn: [row.id, ...related.map((r) => r.id)] } },
          include: POST_INCLUDE,
          orderBy: { publishedAt: 'desc' },
          take: BLOG_RELATED - related.length,
        })),
      );
    }
    const liked = viewer ? !!(await this.prisma.blogLike.findUnique({ where: { userId_targetType_targetId: { userId: viewer.id, targetType: 'post', targetId: row.id } } })) : false;
    return {
      ...this.listItem(row, cats),
      body: row.body,
      metaTitle: row.metaTitle,
      metaDescription: row.metaDescription,
      likedByMe: liked,
      related: related.map((r) => this.listItem(r, cats)),
    };
  }

  /** GET /posts/:id/cover — a fresh 10-minute link to a published post's clean cover. */
  async coverUrl(id: string): Promise<string> {
    const row = await this.prisma.post.findFirst({ where: { ...PUBLIC, id }, include: POST_INCLUDE });
    if (!row?.coverImageKey || row.coverUpload?.scanStatus !== 'clean') throw notFound('Cover');
    return this.uploads.signedUrl(row.coverImageKey);
  }

  /** Oldest first; blocked people (either way) are hidden from a signed-in viewer. */
  async comments(viewer: AuthUser | undefined, postId: string, q: z.output<typeof blogCommentsQuerySchema>): Promise<Paginated<BlogCommentItem>> {
    await this.publicPost(postId);
    const where: Prisma.BlogCommentWhereInput = {
      postId,
      deletedAt: null,
      removedReason: null,
      author: AVAILABLE_USER,
      ...(viewer ? { authorId: { notIn: await this.hiddenAuthors(viewer.id) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.blogComment.findMany({ where, include: { author: { select: AUTHOR_SELECT } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.blogComment.count({ where }),
    ]);
    const liked = viewer ? await this.likedSet(viewer.id, 'comment', rows.map((r) => r.id)) : new Set<string>();
    return {
      data: rows.map((c) => ({ id: c.id, author: this.author(c.author), mine: c.authorId === viewer?.id, body: c.body, likes: c.likesCount, likedByMe: liked.has(c.id), createdAt: c.createdAt.toISOString() })),
      meta: { page: q.page, limit: q.limit, total },
    };
  }

  // ───────────── writers ─────────────

  async mine(user: AuthUser): Promise<MyBlogPost[]> {
    const rows = await this.prisma.post.findMany({ where: { authorId: user.id, deletedAt: null }, include: POST_INCLUDE, orderBy: { updatedAt: 'desc' } });
    return Promise.all(rows.map((r) => this.myItem(r)));
  }

  async myOne(user: AuthUser, id: string): Promise<MyBlogPost> {
    return this.myItem(await this.own(user, id));
  }

  async create(user: AuthUser, input: z.output<typeof createBlogPostSchema>): Promise<MyBlogPost> {
    if (input.category) await this.checkCategory(input.category);
    const cover = input.coverUploadId ? await this.uploads.claim(user.id, input.coverUploadId, 'post_cover') : null;
    const row = await this.prisma.post.create({
      data: {
        authorId: user.id,
        title: input.title,
        body: cleanBody(input.body),
        category: input.category ?? null,
        excerpt: input.excerpt ?? null,
        metaTitle: input.metaTitle ?? null,
        metaDescription: input.metaDescription ?? null,
        coverUploadId: cover?.id ?? null,
        coverImageKey: cover?.objectKey ?? null,
      },
      include: POST_INCLUDE,
    });
    if (cover) await this.uploads.enqueueScan(cover.id);
    return this.myItem(row);
  }

  /** Editing a published post sends it back for approval (offline until approved). */
  async update(user: AuthUser, id: string, input: z.output<typeof updateBlogPostSchema>): Promise<MyBlogPost> {
    const row = await this.own(user, id);
    if (input.category) await this.checkCategory(input.category);
    if (row.removedReason) throw rule('This post was taken down by a moderator and cannot be edited');
    const data: Prisma.PostUncheckedUpdateInput = {
      title: input.title,
      body: input.body === undefined ? undefined : cleanBody(input.body),
      category: input.category,
      excerpt: input.excerpt,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
    };
    let claimed: Upload | null = null;
    let oldKey: string | null = null;
    if (input.coverUploadId !== undefined && input.coverUploadId !== row.coverUploadId) {
      claimed = input.coverUploadId ? await this.uploads.claim(user.id, input.coverUploadId, 'post_cover') : null;
      oldKey = row.coverImageKey;
      data.coverUploadId = claimed?.id ?? null;
      data.coverImageKey = claimed?.objectKey ?? null;
    }
    const wasLive = row.status === 'published';
    if (wasLive && user.role !== 'admin') {
      data.status = 'pending';
      data.submittedAt = new Date();
    }
    const updated = await this.prisma.post.update({ where: { id }, data, include: POST_INCLUDE });
    if (claimed) await this.uploads.enqueueScan(claimed.id);
    if (oldKey) await this.uploads.deleteObject(oldKey).catch(() => undefined);
    if (wasLive && updated.slug) await this.refresh(updated.slug);
    return this.myItem(updated);
  }

  /** Send for approval (admins publish directly). */
  async submit(user: AuthUser, id: string): Promise<MyBlogPost> {
    const row = await this.own(user, id);
    if (row.removedReason) throw rule('This post was taken down by a moderator and cannot be sent again');
    if (row.status === 'published') throw rule('This post is already published');
    const missing: string[] = [];
    if (!row.category) missing.push('category');
    if (htmlToText(row.body).length < BLOG_BODY_MIN_CHARS) missing.push('body');
    if (missing.length) {
      throw rule(`Add a category and at least ${BLOG_BODY_MIN_CHARS} characters of text before sending the post`, { missing });
    }
    if (user.role === 'admin') return this.myItem(await this.publish(row));
    const updated = await this.prisma.post.update({ where: { id }, data: { status: 'pending', submittedAt: new Date(), reviewNote: null }, include: POST_INCLUDE });
    return this.myItem(updated);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const row = await this.own(user, id);
    await this.erase(row);
  }

  async like(user: AuthUser, id: string, on: boolean): Promise<LikeResponse> {
    await this.publicPost(id);
    return { likes: await this.toggleLike(user.id, 'post', id, on), likedByMe: on };
  }

  async comment(user: AuthUser, postId: string, input: z.output<typeof createBlogCommentSchema>): Promise<BlogCommentItem> {
    const post = await this.publicPost(postId);
    if ((await this.hiddenAuthors(user.id)).includes(post.authorId)) throw notFound();
    const [created] = await this.prisma.$transaction([
      this.prisma.blogComment.create({ data: { postId, authorId: user.id, body: input.body }, include: { author: { select: AUTHOR_SELECT } } }),
      this.prisma.post.update({ where: { id: postId }, data: { commentsCount: { increment: 1 } } }),
    ]);
    await this.refresh(post.slug!);
    if (post.authorId !== user.id) {
      const name = this.author(created.author).name;
      const preview = input.body.length > 140 ? `${input.body.slice(0, 140)}…` : input.body;
      const url = `${this.config.getOrThrow<string>('APP_URL')}${blogPath(post.slug!)}`;
      await this.notifications.notify({
        userId: post.authorId,
        type: 'blog_comment',
        title: `${name} commented on your blog post`,
        body: preview,
        link: blogPath(post.slug!),
        email: post.author.email ? simpleEmail(post.author.email, `New comment on "${post.title}"`, [`${name} wrote:`, preview], { url, text: 'See the comment' }) : undefined,
      });
    }
    return { id: created.id, author: this.author(created.author), mine: true, body: created.body, likes: 0, likedByMe: false, createdAt: created.createdAt.toISOString() };
  }

  async removeComment(user: AuthUser, id: string): Promise<void> {
    const c = await this.prisma.blogComment.findFirst({ where: { id, authorId: user.id, deletedAt: null } });
    if (!c) throw notFound('Comment');
    await this.dropComment(c.id, c.postId, { deletedAt: new Date(), body: '' });
  }

  async likeComment(user: AuthUser, id: string, on: boolean): Promise<LikeResponse> {
    const c = await this.prisma.blogComment.findFirst({ where: { id, deletedAt: null, removedReason: null, author: AVAILABLE_USER } });
    if (!c) throw notFound('Comment');
    await this.publicPost(c.postId);
    if ((await this.hiddenAuthors(user.id)).includes(c.authorId)) throw notFound('Comment');
    return { likes: await this.toggleLike(user.id, 'comment', id, on), likedByMe: on };
  }

  // ───────────── admin ─────────────

  async adminList(q: z.output<typeof adminBlogQuerySchema>): Promise<Paginated<AdminBlogPostItem>> {
    const where: Prisma.PostWhereInput = { status: q.status, deletedAt: null };
    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({ where, include: POST_INCLUDE, orderBy: q.status === 'pending' ? { submittedAt: 'asc' } : { updatedAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.post.count({ where }),
    ]);
    return { data: await Promise.all(rows.map((r) => this.adminItem(r))), meta: { page: q.page, limit: q.limit, total } };
  }

  async adminGet(id: string): Promise<AdminBlogPostItem> {
    const row = await this.prisma.post.findFirst({ where: { id, deletedAt: null }, include: POST_INCLUDE });
    if (!row) throw notFound();
    return this.adminItem(row);
  }

  async approve(id: string): Promise<{ authorId: string; path: string }> {
    const row = await this.prisma.post.findFirst({ where: { id, deletedAt: null }, include: POST_INCLUDE });
    if (!row) throw notFound();
    if (row.status !== 'pending') throw rule('Only posts waiting for approval can be approved');
    const live = await this.publish(row);
    const path = blogPath(live.slug!);
    await this.notifications.notify({
      userId: row.authorId,
      type: 'blog_review',
      title: 'Your blog post is published',
      body: row.title,
      link: path,
      email: row.author.email
        ? simpleEmail(row.author.email, `Your post "${row.title}" is live on ${APP_NAME}`, ['An admin approved your blog post. It is now public.'], {
            url: `${this.config.getOrThrow<string>('APP_URL')}${path}`,
            text: 'Read your post',
          })
        : undefined,
    });
    return { authorId: row.authorId, path };
  }

  async reject(id: string, reason: string): Promise<{ authorId: string }> {
    const row = await this.prisma.post.findFirst({ where: { id, deletedAt: null }, include: POST_INCLUDE });
    if (!row) throw notFound();
    if (row.status !== 'pending') throw rule('Only posts waiting for approval can be rejected');
    await this.prisma.post.update({ where: { id }, data: { status: 'rejected', reviewNote: reason } });
    const link = `${row.author.role === 'teacher' ? '/teacher' : '/hiring'}/blog/${id}`;
    await this.notifications.notify({
      userId: row.authorId,
      type: 'blog_review',
      title: 'Your blog post was not approved',
      body: `Reason: ${reason}`,
      link,
      email: row.author.email
        ? simpleEmail(row.author.email, `Your post "${row.title}" was not approved`, ['An admin reviewed your blog post and did not approve it.', `Reason: ${reason}`, 'You can edit it and send it again.'], {
            url: `${this.config.getOrThrow<string>('APP_URL')}${link}`,
            text: 'Edit the post',
          })
        : undefined,
    });
    return { authorId: row.authorId };
  }

  /** Takedown of a published post (reported): offline for good, the writer is told why. */
  async adminRemove(id: string, reason: string): Promise<{ authorId: string }> {
    const row = await this.prisma.post.findFirst({ where: { id, deletedAt: null }, include: POST_INCLUDE });
    if (!row) throw notFound();
    await this.prisma.post.update({ where: { id }, data: { removedReason: reason } });
    if (row.slug) await this.refresh(row.slug);
    await this.notifications.notify({
      userId: row.authorId,
      type: 'moderation',
      title: 'Your blog post was removed',
      body: `Reason: ${reason}`,
      alwaysEmail: true,
      email: row.author.email
        ? simpleEmail(row.author.email, `Your blog post was removed on ${APP_NAME}`, [`"${row.title}" was removed by our moderators.`, `Reason: ${reason}`], {
            url: `${this.config.getOrThrow<string>('APP_URL')}/login`,
            text: `Open ${APP_NAME}`,
          })
        : undefined,
    });
    return { authorId: row.authorId };
  }

  async adminRemoveComment(id: string, reason: string): Promise<{ authorId: string }> {
    const c = await this.prisma.blogComment.findFirst({ where: { id, deletedAt: null, removedReason: null }, include: { author: { select: AUTHOR_SELECT } } });
    if (!c) throw notFound('Comment');
    await this.dropComment(c.id, c.postId, { removedReason: reason });
    await this.notifications.notify({
      userId: c.authorId,
      type: 'moderation',
      title: 'Your blog comment was removed',
      body: `Reason: ${reason}`,
      alwaysEmail: true,
      email: c.author.email
        ? simpleEmail(c.author.email, `Your blog comment was removed on ${APP_NAME}`, ['A comment you wrote on the blog was removed by our moderators.', `Reason: ${reason}`], {
            url: `${this.config.getOrThrow<string>('APP_URL')}/login`,
            text: `Open ${APP_NAME}`,
          })
        : undefined,
    });
    return { authorId: c.authorId };
  }

  /** Sitemap: published posts with lastmod. */
  async sitemap(): Promise<{ data: { path: string; lastmod: string }[] }> {
    const rows = await this.prisma.post.findMany({ where: PUBLIC, select: { slug: true, updatedAt: true }, orderBy: { publishedAt: 'desc' }, take: 50000 });
    return { data: rows.map((r) => ({ path: blogPath(r.slug!), lastmod: r.updatedAt.toISOString() })) };
  }

  // ───────────── internals ─────────────

  /** First approval sets the slug from the title; it never changes after that. */
  private async publish(row: PostRow): Promise<PostRow> {
    let slug = row.slug;
    if (!slug) {
      const base = slugify(row.title).slice(0, 80).replace(/-+$/, '') || 'post';
      slug = base;
      for (let n = 2; await this.prisma.post.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${base}-${n}`;
    }
    const live = await this.prisma.post.update({
      where: { id: row.id },
      data: { status: 'published', slug, reviewNote: null, publishedAt: row.publishedAt ?? new Date() },
      include: POST_INCLUDE,
    });
    await this.refresh(slug);
    return live;
  }

  private refresh(slug: string): Promise<void> {
    return this.seo.revalidate(['blog', `blog:${slug}`]);
  }

  /** Deleting a post (writer, or account erasure) takes it down and removes the cover. */
  async erase(row: { id: string; slug: string | null; coverImageKey: string | null }): Promise<void> {
    await this.prisma.post.update({ where: { id: row.id }, data: { deletedAt: new Date(), body: '', coverImageKey: null, coverUploadId: null } });
    if (row.coverImageKey) await this.uploads.deleteObject(row.coverImageKey).catch(() => undefined);
    if (row.slug) await this.refresh(row.slug);
  }

  private async own(user: AuthUser, id: string): Promise<PostRow> {
    const row = await this.prisma.post.findFirst({ where: { id, authorId: user.id, deletedAt: null }, include: POST_INCLUDE });
    if (!row) throw notFound();
    return row;
  }

  private async publicPost(id: string): Promise<PostRow> {
    const row = await this.prisma.post.findFirst({ where: { ...PUBLIC, id }, include: POST_INCLUDE });
    if (!row) throw notFound();
    return row;
  }

  private async checkCategory(slug: string): Promise<void> {
    const c = await this.prisma.blogCategory.findFirst({ where: { slug, isActive: true } });
    if (!c) throw invalid('category', 'Choose a category from the list');
  }

  private async categoryNames(): Promise<Map<string, string>> {
    return new Map((await this.prisma.blogCategory.findMany()).map((c) => [c.slug, c.name]));
  }

  /** People hidden from this viewer through community blocks (either way). */
  private async hiddenAuthors(userId: string): Promise<string[]> {
    const rows = await this.prisma.communityBlock.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } });
    return rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId));
  }

  private author(a: AuthorRow): BlogAuthor {
    if (a.role === 'teacher') return { name: a.teacherProfile?.fullName ?? 'Teacher', role: 'teacher' };
    if (a.role === 'admin') return { name: `${APP_NAME} team`, role: 'admin' };
    return a.role === 'director' ? { name: 'Director', role: 'director' } : { name: 'Principal', role: 'principal' };
  }

  private listItem(r: PostRow, cats: Map<string, string>): BlogPostListItem {
    return {
      id: r.id,
      slug: r.slug!,
      path: blogPath(r.slug!),
      title: r.title,
      excerpt: excerptOf(r),
      category: r.category ? { slug: r.category, name: cats.get(r.category) ?? r.category } : null,
      hasCover: !!r.coverImageKey && r.coverUpload?.scanStatus === 'clean',
      author: this.author(r.author),
      publishedAt: (r.publishedAt ?? r.createdAt).toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      likes: r.likesCount,
      comments: r.commentsCount,
    };
  }

  private async myItem(r: PostRow): Promise<MyBlogPost> {
    const scan = r.coverUpload?.scanStatus;
    const ready = !!r.coverImageKey && scan === 'clean';
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      reviewNote: r.reviewNote,
      removedReason: r.removedReason,
      path: r.slug && r.status === 'published' && !r.removedReason ? blogPath(r.slug) : null,
      category: r.category,
      excerpt: r.excerpt,
      body: r.body,
      coverUploadId: r.coverUploadId,
      coverUrl: ready ? await this.uploads.signedUrl(r.coverImageKey!) : null,
      coverStatus: !r.coverImageKey ? 'none' : ready ? 'ready' : 'scanning',
      metaTitle: r.metaTitle,
      metaDescription: r.metaDescription,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      updatedAt: r.updatedAt.toISOString(),
      likes: r.likesCount,
      comments: r.commentsCount,
    };
  }

  private async adminItem(r: PostRow): Promise<AdminBlogPostItem> {
    return { ...(await this.myItem(r)), author: { ...this.author(r.author), email: r.author.email } };
  }

  private async likedSet(userId: string, targetType: 'post' | 'comment', ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = await this.prisma.blogLike.findMany({ where: { userId, targetType, targetId: { in: ids } }, select: { targetId: true } });
    return new Set(rows.map((r) => r.targetId));
  }

  /** Idempotent like/unlike; the stored count moves only when the like row changes. */
  private async toggleLike(userId: string, targetType: 'post' | 'comment', targetId: string, on: boolean): Promise<number> {
    let delta = 0;
    if (on) {
      try {
        await this.prisma.blogLike.create({ data: { userId, targetType, targetId } });
        delta = 1;
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
    } else {
      delta = -(await this.prisma.blogLike.deleteMany({ where: { userId, targetType, targetId } })).count;
    }
    if (targetType === 'post') {
      const p = delta
        ? await this.prisma.post.update({ where: { id: targetId }, data: { likesCount: { increment: delta } }, select: { likesCount: true, slug: true } })
        : await this.prisma.post.findUniqueOrThrow({ where: { id: targetId }, select: { likesCount: true, slug: true } });
      if (delta && p.slug) await this.refresh(p.slug);
      return p.likesCount;
    }
    const c = delta
      ? await this.prisma.blogComment.update({ where: { id: targetId }, data: { likesCount: { increment: delta } }, select: { likesCount: true } })
      : await this.prisma.blogComment.findUniqueOrThrow({ where: { id: targetId }, select: { likesCount: true } });
    return c.likesCount;
  }

  private async dropComment(id: string, postId: string, data: Prisma.BlogCommentUpdateInput): Promise<void> {
    await this.prisma.blogComment.update({ where: { id }, data });
    await this.prisma.blogLike.deleteMany({ where: { targetType: 'comment', targetId: id } });
    const p = await this.prisma.post.update({ where: { id: postId }, data: { commentsCount: { decrement: 1 } }, select: { slug: true } });
    if (p.slug) await this.refresh(p.slug);
  }

  /** Infected or unreadable covers are removed from the post. */
  private async coverScanned(upload: Upload, outcome: ScanOutcome): Promise<void> {
    const post = await this.prisma.post.findUnique({ where: { coverUploadId: upload.id } });
    if (!post) return;
    if (outcome !== 'clean') {
      await this.prisma.post.update({ where: { id: post.id }, data: { coverUploadId: null, coverImageKey: null } });
      await this.uploads.deleteObject(upload.objectKey).catch(() => undefined);
    }
    if (post.slug) await this.refresh(post.slug);
  }
}
