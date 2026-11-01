import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Patch, Post, Query, Redirect } from '@nestjs/common';
import {
  adminBlogQuerySchema,
  blogCommentsQuerySchema,
  blogListQuerySchema,
  createBlogCommentSchema,
  createBlogPostSchema,
  reasonSchema,
  updateBlogPostSchema,
} from '@edu-forum/shared';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public, RequireVerified, Roles } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditService } from '../../infra/audit/audit.service';
import { SeoModule } from '../seo/seo.module';
import { UploadsModule } from '../uploads/uploads.module';
import { BlogService } from './blog.service';

type Q<T extends z.ZodType> = z.output<T>;
const uuid = new ParseUUIDPipe();
const slugParam = z.string().trim().min(1).max(200).regex(/^[a-z0-9-]+$/);

/**
 * Blog posts (user, 2026-11-01). Public: list, read, comments, cover. Writers (any registered
 * teacher, principal, director, or admin): drafts, send for approval, like, comment.
 */
@Controller('posts')
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  @Public()
  list(@Query(new ZodValidationPipe(blogListQuerySchema)) q: Q<typeof blogListQuerySchema>) {
    return this.blog.list(q);
  }

  @Get('mine')
  @Roles('teacher', 'leader', 'admin')
  @RequireVerified()
  mine(@CurrentUser() user: AuthUser) {
    return this.blog.mine(user);
  }

  @Get('mine/:id')
  @Roles('teacher', 'leader', 'admin')
  @RequireVerified()
  myOne(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.blog.myOne(user, id);
  }

  @Get('by-slug/:slug')
  @Public()
  bySlug(@CurrentUser() user: AuthUser | undefined, @Param('slug', new ZodValidationPipe(slugParam)) slug: string) {
    return this.blog.bySlug(user, slug);
  }

  /** Cover photo of a published post: redirects to a fresh 10-minute link. */
  @Get(':id/cover')
  @Public()
  @Redirect()
  @Header('Cache-Control', 'public, max-age=300')
  async cover(@Param('id', uuid) id: string) {
    return { url: await this.blog.coverUrl(id), statusCode: HttpStatus.FOUND };
  }

  @Get(':id/comments')
  @Public()
  comments(@CurrentUser() user: AuthUser | undefined, @Param('id', uuid) id: string, @Query(new ZodValidationPipe(blogCommentsQuerySchema)) q: Q<typeof blogCommentsQuerySchema>) {
    return this.blog.comments(user, id, q);
  }

  @Post()
  @Roles('teacher', 'leader', 'admin')
  @RequireVerified()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createBlogPostSchema)) body: Q<typeof createBlogPostSchema>) {
    return this.blog.create(user, body);
  }

  @Patch(':id')
  @Roles('teacher', 'leader', 'admin')
  @RequireVerified()
  update(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(updateBlogPostSchema)) body: Q<typeof updateBlogPostSchema>) {
    return this.blog.update(user, id, body);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @Roles('teacher', 'leader', 'admin')
  @RequireVerified()
  submit(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.blog.submit(user, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('teacher', 'leader', 'admin')
  @RequireVerified()
  remove(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.blog.remove(user, id);
  }

  @Post(':id/like')
  @HttpCode(HttpStatus.OK)
  @Roles('teacher', 'leader', 'admin')
  @RequireVerified()
  like(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.blog.like(user, id, true);
  }

  @Delete(':id/like')
  @Roles('teacher', 'leader', 'admin')
  @RequireVerified()
  unlike(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.blog.like(user, id, false);
  }

  @Post(':id/comments')
  @Roles('teacher', 'leader', 'admin')
  @RequireVerified()
  comment(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(createBlogCommentSchema)) body: Q<typeof createBlogCommentSchema>) {
    return this.blog.comment(user, id, body);
  }
}

@Controller('blog-comments')
@Roles('teacher', 'leader', 'admin')
@RequireVerified()
export class BlogCommentsController {
  constructor(private readonly blog: BlogService) {}

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.blog.removeComment(user, id);
  }

  @Post(':id/like')
  @HttpCode(HttpStatus.OK)
  like(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.blog.likeComment(user, id, true);
  }

  @Delete(':id/like')
  unlike(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.blog.likeComment(user, id, false);
  }
}

/** Public lists for the blog pages and the sitemap. */
@Controller()
@Public()
export class BlogPublicController {
  constructor(private readonly blog: BlogService) {}

  @Get('blog/categories')
  categories() {
    return this.blog.categories();
  }

  @Get('seo/sitemap/blog')
  sitemap() {
    return this.blog.sitemap();
  }
}

/** Admin review queue and moderation (every action audit-logged; the writer is told). */
@Controller('admin')
@Roles('admin')
export class AdminBlogController {
  constructor(
    private readonly blog: BlogService,
    private readonly audit: AuditService,
  ) {}

  @Get('posts')
  list(@Query(new ZodValidationPipe(adminBlogQuerySchema)) q: Q<typeof adminBlogQuerySchema>) {
    return this.blog.adminList(q);
  }

  @Get('posts/:id')
  get(@Param('id', uuid) id: string) {
    return this.blog.adminGet(id);
  }

  @Post('posts/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(@CurrentUser() me: AuthUser, @Param('id', uuid) id: string) {
    const { authorId, path } = await this.blog.approve(id);
    await this.audit.log({ actorId: me.id, action: 'blog.approve', targetType: 'post', targetId: id, metadata: { authorId, path } });
    return { id, status: 'published', path };
  }

  @Post('posts/:id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(@CurrentUser() me: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(reasonSchema)) body: Q<typeof reasonSchema>) {
    const { authorId } = await this.blog.reject(id, body.reason);
    await this.audit.log({ actorId: me.id, action: 'blog.reject', targetType: 'post', targetId: id, metadata: { authorId, reason: body.reason } });
    return { id, status: 'rejected' };
  }

  @Post('posts/:id/remove')
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser() me: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(reasonSchema)) body: Q<typeof reasonSchema>) {
    const { authorId } = await this.blog.adminRemove(id, body.reason);
    await this.audit.log({ actorId: me.id, action: 'blog.remove', targetType: 'post', targetId: id, metadata: { authorId, reason: body.reason } });
    return { id, removed: true };
  }

  @Post('blog-comments/:id/remove')
  @HttpCode(HttpStatus.OK)
  async removeComment(@CurrentUser() me: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(reasonSchema)) body: Q<typeof reasonSchema>) {
    const { authorId } = await this.blog.adminRemoveComment(id, body.reason);
    await this.audit.log({ actorId: me.id, action: 'blog.comment.remove', targetType: 'blog_comment', targetId: id, metadata: { authorId, reason: body.reason } });
    return { id, removed: true };
  }
}

@Module({
  imports: [UploadsModule, SeoModule],
  controllers: [BlogController, BlogCommentsController, BlogPublicController, AdminBlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
