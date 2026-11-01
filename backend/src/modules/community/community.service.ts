import { HttpStatus, Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  APP_NAME,
  COMMUNITY_WS_EVENTS,
  blogPath,
  htmlToText,
  jobPath,
  type blockUserSchema,
  type commentsQuerySchema,
  type CommunityAuthor,
  type CommunityCommentItem,
  type CommunityFeedPage,
  type CommunityPostItem,
  type CommunityPhotoItem,
  type CommunityPostUpdate,
  type CommunitySharedBlog,
  type CommunitySharedPost,
  type CommunitySharedJob,
  type CommunityTagItem,
  type createCommentSchema,
  type createPostSchema,
  type feedQuerySchema,
  type LikeResponse,
  type Paginated,
} from '@edu-forum/shared';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { AVAILABLE_USER, isAvailable } from '../../common/available-user';
import { ApiException } from '../../common/filters/api-exception.filter';
import type { Prisma, Upload } from '../../generated/prisma/client';
import { simpleEmail } from '../../infra/mail/simple-email';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RealtimeGateway } from '../../infra/realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadsService, type ScanOutcome } from '../uploads/uploads.service';
import { toVacancyResponse, VACANCY_INCLUDE } from '../vacancies/vacancy.serializer';

const ROLE_NAME = { principal: 'Principal', director: 'Director' } as const;
const notFound = (what = 'Post') => new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`);
const rule = (message: string) => new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', message);

const AUTHOR_SELECT = {
  id: true,
  role: true,
  teacherProfile: { select: { id: true, fullName: true, photoKey: true } },
} satisfies Prisma.UserSelect;
type AuthorRow = Prisma.UserGetPayload<{ select: typeof AUTHOR_SELECT }>;

const BASE_INCLUDE = {
  author: { select: { ...AUTHOR_SELECT, status: true, deletedAt: true, deletionRequestedAt: true } },
  photos: { orderBy: { position: 'asc' }, include: { upload: { select: { scanStatus: true } } } },
  vacancy: { include: { ...VACANCY_INCLUDE, createdBy: { select: { role: true, status: true, deletedAt: true, deletionRequestedAt: true } } } },
} satisfies Prisma.CommunityPostInclude;
type BaseRow = Prisma.CommunityPostGetPayload<{ include: typeof BASE_INCLUDE }>;
/** A post plus, for a share, the original post. */
const BLOG_INCLUDE = {
  include: { author: { select: { status: true, deletedAt: true, deletionRequestedAt: true } }, coverUpload: { select: { scanStatus: true } } },
} satisfies Prisma.PostDefaultArgs;
const POST_INCLUDE = { ...BASE_INCLUDE, shared: { include: BASE_INCLUDE }, blogPost: BLOG_INCLUDE } satisfies Prisma.CommunityPostInclude;
type PostRow = Prisma.CommunityPostGetPayload<{ include: typeof POST_INCLUDE }>;

/** Visible posts: not deleted or removed, author still around. */
const VISIBLE = { deletedAt: null, removedReason: null, author: AVAILABLE_USER } satisfies Prisma.CommunityPostWhereInput;

/**
 * The community feed (user, 2026-10-31; limits confirmed 2026-11-01): one shared feed for every
 * signed-in teacher, principal and director. Posts have text (≤ 2,000), up to 4 photos
 * (scanned before anyone sees them), an optional topic tag and an optional shared job.
 * Likes and comments; blocking hides both sides from each other; admins remove reported posts.
 * Live updates go to the "community" room on /ws; clients refetch through REST.
 */
@Injectable()
export class CommunityService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.uploads.onScanned('community_photo', (upload, outcome) => this.photoScanned(upload, outcome));
  }

  async tags(): Promise<CommunityTagItem[]> {
    const rows = await this.prisma.communityTag.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map((t) => ({ slug: t.slug, name: t.name }));
  }

  // ───────────── posts ─────────────

  async feed(user: AuthUser, q: z.output<typeof feedQuerySchema>): Promise<CommunityFeedPage> {
    const where: Prisma.CommunityPostWhereInput = { ...VISIBLE, tag: q.tag, authorId: { notIn: await this.hiddenAuthors(user.id) } };
    if (q.before) {
      const cursor = await this.prisma.communityPost.findUnique({ where: { id: q.before }, select: { createdAt: true } });
      if (cursor) where.OR = [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: q.before } }];
    }
    const rows = await this.prisma.communityPost.findMany({
      where,
      include: POST_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const page = rows.slice(0, q.limit);
    return { data: await this.postItems(user, page), nextBefore: rows.length > q.limit ? page[page.length - 1].id : null };
  }

  async get(user: AuthUser, id: string): Promise<CommunityPostItem> {
    const row = await this.visiblePost(user, id);
    return (await this.postItems(user, [row]))[0];
  }

  async create(user: AuthUser, input: z.output<typeof createPostSchema>): Promise<CommunityPostItem> {
    let tag: string | null = null;
    if (input.tag) {
      const t = await this.prisma.communityTag.findFirst({ where: { slug: input.tag, isActive: true } });
      if (!t) throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Validation failed', { issues: [{ path: 'tag', message: 'Choose a topic from the list' }] });
      tag = t.slug;
    }
    if (input.vacancyId) {
      const v = await this.prisma.vacancy.findFirst({
        where: { id: input.vacancyId, status: 'published', deletedAt: null, takedownReason: null, createdBy: AVAILABLE_USER },
        select: { id: true },
      });
      if (!v) throw rule('Only live jobs can be shared');
    }
    // Sharing a share shares the original (one level, like other social feeds).
    let sharedPostId: string | null = null;
    if (input.sharedPostId) {
      const original = await this.visiblePost(user, input.sharedPostId);
      sharedPostId = original.sharedPostId ?? original.id;
      if (original.sharedPostId) await this.visiblePost(user, sharedPostId);
    }
    if (input.blogPostId) {
      const b = await this.prisma.post.findFirst({
        where: { id: input.blogPostId, status: 'published', deletedAt: null, removedReason: null, slug: { not: null }, author: AVAILABLE_USER },
        select: { id: true },
      });
      if (!b) throw rule('Only published blog posts can be shared');
    }
    const ids = [...new Set(input.uploadIds)];
    const claimed: Upload[] = [];
    for (const id of ids) claimed.push(await this.uploads.claim(user.id, id, 'community_photo'));

    const post = await this.prisma.communityPost.create({
      data: {
        authorId: user.id,
        body: input.body,
        tag,
        vacancyId: input.vacancyId ?? null,
        sharedPostId,
        blogPostId: input.blogPostId ?? null,
        photos: { create: claimed.map((u, i) => ({ uploadId: u.id, objectKey: u.objectKey, position: i })) },
      },
    });
    for (const u of claimed) await this.uploads.enqueueScan(u.id);
    if (sharedPostId) {
      await this.prisma.communityPost.update({ where: { id: sharedPostId }, data: { sharesCount: { increment: 1 } } });
      await this.pushCounts(sharedPostId);
    }
    this.realtime.emitToCommunity(COMMUNITY_WS_EVENTS.newPost, { postId: post.id, authorId: user.id });
    return this.get(user, post.id);
  }

  /** Authors delete their own posts (photos are erased from storage). */
  async remove(user: AuthUser, id: string): Promise<void> {
    const post = await this.prisma.communityPost.findFirst({ where: { id, authorId: user.id, deletedAt: null }, include: { photos: true } });
    if (!post) throw notFound();
    await this.erasePost(post.id, post.photos.map((p) => p.objectKey));
  }

  async like(user: AuthUser, id: string, on: boolean): Promise<LikeResponse> {
    await this.visiblePost(user, id);
    const likes = await this.toggleLike(user.id, 'post', id, on);
    await this.pushCounts(id);
    return { likes, likedByMe: on };
  }

  // ───────────── comments ─────────────

  /** Oldest first, so a thread reads top to bottom. */
  async comments(user: AuthUser, postId: string, q: z.output<typeof commentsQuerySchema>): Promise<Paginated<CommunityCommentItem>> {
    await this.visiblePost(user, postId);
    const where: Prisma.CommunityCommentWhereInput = {
      postId,
      deletedAt: null,
      removedReason: null,
      author: AVAILABLE_USER,
      authorId: { notIn: await this.hiddenAuthors(user.id) },
    };
    const [rows, total] = await Promise.all([
      this.prisma.communityComment.findMany({
        where,
        include: { author: { select: AUTHOR_SELECT } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.communityComment.count({ where }),
    ]);
    const liked = await this.likedSet(user.id, 'comment', rows.map((r) => r.id));
    return {
      data: await Promise.all(rows.map(async (c) => this.commentItem(user, c, liked.has(c.id)))),
      meta: { page: q.page, limit: q.limit, total },
    };
  }

  async comment(user: AuthUser, postId: string, input: z.output<typeof createCommentSchema>): Promise<CommunityCommentItem> {
    const post = await this.visiblePost(user, postId);
    const [created, after] = await this.prisma.$transaction([
      this.prisma.communityComment.create({ data: { postId, authorId: user.id, body: input.body }, include: { author: { select: AUTHOR_SELECT } } }),
      this.prisma.communityPost.update({ where: { id: postId }, data: { commentsCount: { increment: 1 } }, select: { likesCount: true, commentsCount: true } }),
    ]);
    await this.pushCounts(postId);
    this.realtime.emitToCommunity(COMMUNITY_WS_EVENTS.newComment, { postId, commentId: created.id, authorId: user.id });
    if (post.authorId !== user.id) await this.notifyAuthor(user, post, input.body);
    return this.commentItem(user, created, false);
  }

  async removeComment(user: AuthUser, id: string): Promise<void> {
    const c = await this.prisma.communityComment.findFirst({ where: { id, authorId: user.id, deletedAt: null } });
    if (!c) throw notFound('Comment');
    await this.dropComment(c.id, c.postId);
  }

  async likeComment(user: AuthUser, id: string, on: boolean): Promise<LikeResponse> {
    const c = await this.prisma.communityComment.findFirst({ where: { id, deletedAt: null, removedReason: null, author: AVAILABLE_USER } });
    if (!c) throw notFound('Comment');
    await this.visiblePost(user, c.postId);
    if ((await this.hiddenAuthors(user.id)).includes(c.authorId)) throw notFound('Comment');
    return { likes: await this.toggleLike(user.id, 'comment', id, on), likedByMe: on };
  }

  // ───────────── blocks ─────────────

  async blocks(user: AuthUser): Promise<CommunityAuthor[]> {
    const rows = await this.prisma.communityBlock.findMany({ where: { blockerId: user.id }, include: { blocked: { select: AUTHOR_SELECT } }, orderBy: { createdAt: 'desc' } });
    return Promise.all(rows.map((r) => this.author(user, r.blocked)));
  }

  async block(user: AuthUser, input: z.output<typeof blockUserSchema>): Promise<void> {
    if (input.userId === user.id) throw rule('You cannot block yourself');
    const target = await this.prisma.user.findFirst({ where: { id: input.userId, deletedAt: null, role: { not: 'admin' } }, select: { id: true } });
    if (!target) throw notFound('User');
    await this.prisma.communityBlock.upsert({
      where: { blockerId_blockedId: { blockerId: user.id, blockedId: input.userId } },
      update: {},
      create: { blockerId: user.id, blockedId: input.userId },
    });
  }

  async unblock(user: AuthUser, userId: string): Promise<void> {
    await this.prisma.communityBlock.deleteMany({ where: { blockerId: user.id, blockedId: userId } });
  }

  // ───────────── moderation (admin) ─────────────

  async adminRemovePost(postId: string, reason: string): Promise<{ authorId: string }> {
    const post = await this.prisma.communityPost.findFirst({ where: { id: postId, deletedAt: null } });
    if (!post) throw notFound();
    await this.prisma.communityPost.update({ where: { id: postId }, data: { removedReason: reason } });
    this.realtime.emitToCommunity(COMMUNITY_WS_EVENTS.postRemoved, { postId });
    await this.notifications.notify({
      userId: post.authorId,
      type: 'moderation',
      title: 'Your community post was removed',
      body: `Reason: ${reason}`,
      alwaysEmail: true,
      email: await this.moderationEmail(post.authorId, 'Your community post was removed', reason),
    });
    return { authorId: post.authorId };
  }

  async adminRemoveComment(commentId: string, reason: string): Promise<{ authorId: string }> {
    const c = await this.prisma.communityComment.findFirst({ where: { id: commentId, deletedAt: null } });
    if (!c) throw notFound('Comment');
    await this.prisma.communityComment.update({ where: { id: commentId }, data: { removedReason: reason } });
    await this.prisma.communityPost.update({ where: { id: c.postId }, data: { commentsCount: { decrement: 1 } } });
    await this.pushCounts(c.postId);
    await this.notifications.notify({
      userId: c.authorId,
      type: 'moderation',
      title: 'Your community comment was removed',
      body: `Reason: ${reason}`,
      alwaysEmail: true,
      email: await this.moderationEmail(c.authorId, 'Your community comment was removed', reason),
    });
    return { authorId: c.authorId };
  }

  // ───────────── internals ─────────────

  /** People hidden from this viewer: those they blocked and those who blocked them. */
  private async hiddenAuthors(userId: string): Promise<string[]> {
    const rows = await this.prisma.communityBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId));
  }

  private async visiblePost(user: AuthUser, id: string): Promise<PostRow> {
    const row = await this.prisma.communityPost.findFirst({ where: { ...VISIBLE, id }, include: POST_INCLUDE });
    if (!row || (await this.hiddenAuthors(user.id)).includes(row.authorId)) throw notFound();
    return row;
  }

  private async likedSet(userId: string, targetType: 'post' | 'comment', ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.communityLike.findMany({ where: { userId, targetType, targetId: { in: ids } }, select: { targetId: true } });
    return new Set(rows.map((r) => r.targetId));
  }

  /** Idempotent like/unlike; the stored count moves only when the like row changes. */
  private async toggleLike(userId: string, targetType: 'post' | 'comment', targetId: string, on: boolean): Promise<number> {
    const key = { userId_targetType_targetId: { userId, targetType, targetId } };
    let delta = 0;
    if (on) {
      const existing = await this.prisma.communityLike.findUnique({ where: key });
      if (!existing) {
        try {
          await this.prisma.communityLike.create({ data: { userId, targetType, targetId } });
          delta = 1;
        } catch {
          // A parallel like won the race.
        }
      }
    } else {
      delta = -(await this.prisma.communityLike.deleteMany({ where: { userId, targetType, targetId } })).count;
    }
    if (targetType === 'post') {
      const p = delta
        ? await this.prisma.communityPost.update({ where: { id: targetId }, data: { likesCount: { increment: delta } }, select: { likesCount: true } })
        : await this.prisma.communityPost.findUniqueOrThrow({ where: { id: targetId }, select: { likesCount: true } });
      return p.likesCount;
    }
    const c = delta
      ? await this.prisma.communityComment.update({ where: { id: targetId }, data: { likesCount: { increment: delta } }, select: { likesCount: true } })
      : await this.prisma.communityComment.findUniqueOrThrow({ where: { id: targetId }, select: { likesCount: true } });
    return c.likesCount;
  }

  private async dropComment(id: string, postId: string): Promise<void> {
    await this.prisma.communityComment.update({ where: { id }, data: { deletedAt: new Date(), body: '' } });
    await this.prisma.communityLike.deleteMany({ where: { targetType: 'comment', targetId: id } });
    await this.prisma.communityPost.update({ where: { id: postId }, data: { commentsCount: { decrement: 1 } } });
    await this.pushCounts(postId);
  }

  /** Deleting a post erases its text and photos; it disappears for everyone. */
  async erasePost(id: string, photoKeys: string[]): Promise<void> {
    const post = await this.prisma.communityPost.update({ where: { id }, data: { deletedAt: new Date(), body: '' } });
    if (post.sharedPostId) {
      await this.prisma.communityPost.update({ where: { id: post.sharedPostId }, data: { sharesCount: { decrement: 1 } } });
      await this.pushCounts(post.sharedPostId);
    }
    for (const key of photoKeys) await this.uploads.deleteObject(key).catch(() => undefined);
    this.realtime.emitToCommunity(COMMUNITY_WS_EVENTS.postRemoved, { postId: id });
  }

  private async pushCounts(postId: string): Promise<void> {
    const p = await this.prisma.communityPost.findUnique({ where: { id: postId }, select: { likesCount: true, commentsCount: true, sharesCount: true } });
    if (!p) return;
    const update: CommunityPostUpdate = { postId, likes: p.likesCount, comments: p.commentsCount, shares: p.sharesCount };
    this.realtime.emitToCommunity(COMMUNITY_WS_EVENTS.postUpdated, update);
  }

  /** Infected or unreadable photos are dropped from the post; clean ones appear live. */
  private async photoScanned(upload: Upload, outcome: ScanOutcome): Promise<void> {
    const photo = await this.prisma.communityPhoto.findUnique({ where: { uploadId: upload.id } });
    if (!photo) return;
    if (outcome !== 'clean') await this.prisma.communityPhoto.delete({ where: { id: photo.id } });
    await this.pushCounts(photo.postId);
  }

  private async notifyAuthor(commenter: AuthUser, post: PostRow, body: string): Promise<void> {
    const who = await this.prisma.user.findUniqueOrThrow({ where: { id: commenter.id }, select: AUTHOR_SELECT });
    const name = (await this.author({ id: post.authorId, role: 'teacher' } as AuthUser, who)).name;
    const recipient = await this.prisma.user.findUniqueOrThrow({ where: { id: post.authorId }, select: { email: true, role: true } });
    const link = `${recipient.role === 'teacher' ? '/teacher' : '/hiring'}/community/${post.id}`;
    const title = `${name} commented on your post`;
    const preview = body.length > 140 ? `${body.slice(0, 140)}…` : body;
    await this.notifications.notify({
      userId: post.authorId,
      type: 'community_comment',
      title,
      body: preview,
      link,
      email: recipient.email
        ? simpleEmail(recipient.email, `${title} on ${APP_NAME}`, [`${name} wrote:`, preview], { url: `${this.config.getOrThrow<string>('APP_URL')}${link}`, text: 'See the conversation' })
        : undefined,
    });
  }

  private async moderationEmail(userId: string, subject: string, reason: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    return u.email
      ? simpleEmail(u.email, `${subject} on ${APP_NAME}`, [`${subject} by our moderators.`, `Reason: ${reason}`, 'Please keep the community respectful and do not share phone numbers.'], {
          url: `${this.config.getOrThrow<string>('APP_URL')}/login`,
          text: `Open ${APP_NAME}`,
        })
      : undefined;
  }

  private async author(viewer: AuthUser, a: AuthorRow): Promise<CommunityAuthor> {
    if (a.role === 'teacher') {
      return {
        userId: a.id,
        name: a.teacherProfile?.fullName ?? 'Teacher',
        role: 'teacher',
        photoUrl: a.teacherProfile?.photoKey ? await this.uploads.signedUrl(a.teacherProfile.photoKey) : null,
        // Principals and directors can open the profile; teachers cannot open each other's.
        teacherId: viewer.role === 'principal' || viewer.role === 'director' ? (a.teacherProfile?.id ?? null) : null,
      };
    }
    const role = a.role === 'director' ? 'director' : 'principal';
    return { userId: a.id, name: ROLE_NAME[role], role, photoUrl: null, teacherId: null };
  }

  private sharedJob(row: BaseRow): CommunitySharedJob | null {
    const v = row.vacancy;
    if (!v || v.deletedAt || v.takedownReason || !isAvailable(v.createdBy) || (v.status !== 'published' && v.status !== 'closed')) return null;
    // Public serializer, never revealed: anonymous schools stay "Confidential school".
    const pub = toVacancyResponse(v, false);
    return {
      id: v.id,
      title: pub.title,
      schoolLabel: pub.schoolLabel,
      place: `${v.lga.name}, ${v.state.name}`,
      salary: { min: v.salaryMin, max: v.salaryMax, currency: v.salaryCurrency, period: v.salaryPeriod },
      path: jobPath(v),
      open: v.status === 'published' && (!v.deadline || v.deadline >= new Date(new Date().toISOString().slice(0, 10))),
    };
  }

  /** A shared blog post, while it is still public. */
  private sharedBlog(r: PostRow): CommunitySharedBlog | null {
    const b = r.blogPost;
    if (!b || b.status !== 'published' || b.deletedAt || b.removedReason || !b.slug || !isAvailable(b.author)) return null;
    const text = b.excerpt ?? htmlToText(b.body).replace(/\s+/g, ' ');
    return {
      id: b.id,
      title: b.title,
      excerpt: text.length > 200 ? `${text.slice(0, 197).trimEnd()}…` : text,
      path: blogPath(b.slug),
      hasCover: !!b.coverImageKey && b.coverUpload?.scanStatus === 'clean',
    };
  }

  private photoItems(row: BaseRow): Promise<CommunityPhotoItem[]> {
    return Promise.all(
      row.photos.map(async (p) =>
        p.upload.scanStatus === 'clean' ? { id: p.id, url: await this.uploads.signedUrl(p.objectKey), status: 'ready' as const } : { id: p.id, url: null, status: 'scanning' as const },
      ),
    );
  }

  /** The original inside a share; gone once deleted, removed, its author left, or blocked. */
  private async sharedItem(user: AuthUser, r: PostRow, hidden: string[], tags: Map<string, string>): Promise<CommunitySharedPost | null> {
    if (!r.sharedPostId) return null;
    const o = r.shared;
    if (!o || o.deletedAt || o.removedReason || !isAvailable(o.author) || hidden.includes(o.authorId)) return { available: false, id: r.sharedPostId };
    return {
      available: true,
      id: o.id,
      author: await this.author(user, o.author),
      body: o.body,
      tag: o.tag ? { slug: o.tag, name: tags.get(o.tag) ?? o.tag } : null,
      photos: await this.photoItems(o),
      job: this.sharedJob(o),
      createdAt: o.createdAt.toISOString(),
    };
  }

  private async postItems(user: AuthUser, rows: PostRow[]): Promise<CommunityPostItem[]> {
    const liked = await this.likedSet(user.id, 'post', rows.map((r) => r.id));
    const tags = new Map((await this.prisma.communityTag.findMany()).map((t) => [t.slug, t.name]));
    const hidden = rows.some((r) => r.sharedPostId) ? await this.hiddenAuthors(user.id) : [];
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        author: await this.author(user, r.author),
        mine: r.authorId === user.id,
        body: r.body,
        tag: r.tag ? { slug: r.tag, name: tags.get(r.tag) ?? r.tag } : null,
        photos: await this.photoItems(r),
        job: this.sharedJob(r),
        shared: await this.sharedItem(user, r, hidden, tags),
        blog: this.sharedBlog(r),
        likes: r.likesCount,
        likedByMe: liked.has(r.id),
        comments: r.commentsCount,
        shares: r.sharesCount,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  }

  private async commentItem(user: AuthUser, c: { id: string; postId: string; authorId: string; body: string; likesCount: number; createdAt: Date; author: AuthorRow }, likedByMe: boolean): Promise<CommunityCommentItem> {
    return {
      id: c.id,
      postId: c.postId,
      author: await this.author(user, c.author),
      mine: c.authorId === user.id,
      body: c.body,
      likes: c.likesCount,
      likedByMe,
      createdAt: c.createdAt.toISOString(),
    };
  }
}
