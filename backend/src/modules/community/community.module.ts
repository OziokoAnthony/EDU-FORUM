import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  blockUserSchema,
  commentsQuerySchema,
  createCommentSchema,
  createPostSchema,
  feedQuerySchema,
  reasonSchema,
} from '@edu-forum/shared';
import type { z } from 'zod';
import { CurrentUser, RequireVerified, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditService } from '../../infra/audit/audit.service';
import { UploadsModule } from '../uploads/uploads.module';
import { CommunityService } from './community.service';

type Q<T extends z.ZodType> = z.output<T>;
const uuid = new ParseUUIDPipe();

/** Community feed for signed-in teachers, principals and directors (noindex, no ads). */
@Controller('community')
@Roles('teacher', 'leader')
@RequireVerified()
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('tags')
  tags() {
    return this.community.tags();
  }

  @Get('posts')
  feed(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(feedQuerySchema)) q: Q<typeof feedQuerySchema>) {
    return this.community.feed(user, q);
  }

  @Post('posts')
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createPostSchema)) body: Q<typeof createPostSchema>) {
    return this.community.create(user, body);
  }

  @Get('posts/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.community.get(user, id);
  }

  @Delete('posts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.community.remove(user, id);
  }

  @Post('posts/:id/like')
  @HttpCode(HttpStatus.OK)
  like(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.community.like(user, id, true);
  }

  @Delete('posts/:id/like')
  unlike(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.community.like(user, id, false);
  }

  @Get('posts/:id/comments')
  comments(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Query(new ZodValidationPipe(commentsQuerySchema)) q: Q<typeof commentsQuerySchema>) {
    return this.community.comments(user, id, q);
  }

  @Post('posts/:id/comments')
  comment(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(createCommentSchema)) body: Q<typeof createCommentSchema>) {
    return this.community.comment(user, id, body);
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeComment(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.community.removeComment(user, id);
  }

  @Post('comments/:id/like')
  @HttpCode(HttpStatus.OK)
  likeComment(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.community.likeComment(user, id, true);
  }

  @Delete('comments/:id/like')
  unlikeComment(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.community.likeComment(user, id, false);
  }

  @Get('blocks')
  blocks(@CurrentUser() user: AuthUser) {
    return this.community.blocks(user);
  }

  @Post('blocks')
  @HttpCode(HttpStatus.NO_CONTENT)
  block(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(blockUserSchema)) body: Q<typeof blockUserSchema>) {
    return this.community.block(user, body);
  }

  @Delete('blocks/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unblock(@CurrentUser() user: AuthUser, @Param('userId', uuid) userId: string) {
    return this.community.unblock(user, userId);
  }
}

/** Admin removal of reported community posts and comments (audit-logged, author told why). */
@Controller('admin/community')
@Roles('admin')
export class AdminCommunityController {
  constructor(
    private readonly community: CommunityService,
    private readonly audit: AuditService,
  ) {}

  @Post('posts/:id/remove')
  @HttpCode(HttpStatus.OK)
  async removePost(@CurrentUser() me: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(reasonSchema)) body: Q<typeof reasonSchema>) {
    const { authorId } = await this.community.adminRemovePost(id, body.reason);
    await this.audit.log({ actorId: me.id, action: 'community.post.remove', targetType: 'community_post', targetId: id, metadata: { reason: body.reason, authorId } });
    return { id, removed: true };
  }

  @Post('comments/:id/remove')
  @HttpCode(HttpStatus.OK)
  async removeComment(@CurrentUser() me: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(reasonSchema)) body: Q<typeof reasonSchema>) {
    const { authorId } = await this.community.adminRemoveComment(id, body.reason);
    await this.audit.log({ actorId: me.id, action: 'community.comment.remove', targetType: 'community_comment', targetId: id, metadata: { reason: body.reason, authorId } });
    return { id, removed: true };
  }
}

@Module({
  imports: [UploadsModule],
  controllers: [CommunityController, AdminCommunityController],
  providers: [CommunityService],
  exports: [CommunityService],
})
export class CommunityModule {}
