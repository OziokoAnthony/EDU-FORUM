import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  adminReportsQuerySchema,
  adminTeachersQuerySchema,
  adminUsersQuerySchema,
  adminVacanciesQuerySchema,
  auditQuerySchema,
  META_TYPES,
  metaItemSchema,
  metaItemUpdateSchema,
  reasonSchema,
  resolveReportSchema,
  type MetaType,
} from '@edu-forum/shared';
import { z } from 'zod';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthModule } from '../auth/auth.module';
import { AdminService } from './admin.service';

const uuid = new ParseUUIDPipe();
const metaType = new ZodValidationPipe(z.enum(META_TYPES));
type Q<T extends z.ZodType> = z.output<T>;

/**
 * PRD "Admin" endpoints (auth A). The verification queue is not built: identity
 * verification was dropped (user, 2026-10-31). `POST /admin/teachers/:id/restore` is an
 * addition (lifts an admin hide), recorded in CLAUDE.md.
 */
@Controller('admin')
@Roles('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('users')
  users(@Query(new ZodValidationPipe(adminUsersQuerySchema)) q: Q<typeof adminUsersQuerySchema>) {
    return this.admin.users(q);
  }

  @Get('users/:id')
  user(@Param('id', uuid) id: string) {
    return this.admin.user(id);
  }

  @Post('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  suspend(@CurrentUser() me: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(reasonSchema)) body: Q<typeof reasonSchema>) {
    return this.admin.suspend(me, id, body.reason);
  }

  @Post('users/:id/reinstate')
  @HttpCode(HttpStatus.OK)
  reinstate(@CurrentUser() me: AuthUser, @Param('id', uuid) id: string) {
    return this.admin.reinstate(me, id);
  }

  @Get('vacancies')
  vacancies(@Query(new ZodValidationPipe(adminVacanciesQuerySchema)) q: Q<typeof adminVacanciesQuerySchema>) {
    return this.admin.vacancies(q);
  }

  @Post('vacancies/:id/takedown')
  @HttpCode(HttpStatus.OK)
  takedown(@CurrentUser() me: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(reasonSchema)) body: Q<typeof reasonSchema>) {
    return this.admin.takedown(me, id, body.reason);
  }

  @Get('teachers')
  teachers(@Query(new ZodValidationPipe(adminTeachersQuerySchema)) q: Q<typeof adminTeachersQuerySchema>) {
    return this.admin.teachers(q);
  }

  @Post('teachers/:id/unpublish')
  @HttpCode(HttpStatus.OK)
  unpublish(@CurrentUser() me: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(reasonSchema)) body: Q<typeof reasonSchema>) {
    return this.admin.unpublishTeacher(me, id, body.reason);
  }

  @Post('teachers/:id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@CurrentUser() me: AuthUser, @Param('id', uuid) id: string) {
    return this.admin.restoreTeacher(me, id);
  }

  @Get('reports')
  reports(@Query(new ZodValidationPipe(adminReportsQuerySchema)) q: Q<typeof adminReportsQuerySchema>) {
    return this.admin.reports(q);
  }

  @Patch('reports/:id')
  resolve(@CurrentUser() me: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(resolveReportSchema)) body: Q<typeof resolveReportSchema>) {
    return this.admin.resolveReport(me, id, body);
  }

  /** Added beyond the PRD table (recorded in CLAUDE.md): includes deactivated items. */
  @Get('meta/:type')
  listMeta(@Param('type', metaType) type: MetaType) {
    return this.admin.listMeta(type);
  }

  @Post('meta/:type')
  createMeta(@CurrentUser() me: AuthUser, @Param('type', metaType) type: MetaType, @Body(new ZodValidationPipe(metaItemSchema)) body: Q<typeof metaItemSchema>) {
    return this.admin.createMeta(me, type, body);
  }

  @Patch('meta/:type/:id')
  updateMeta(
    @CurrentUser() me: AuthUser,
    @Param('type', metaType) type: MetaType,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(metaItemUpdateSchema)) body: Q<typeof metaItemUpdateSchema>,
  ) {
    return this.admin.updateMeta(me, type, id, body);
  }

  @Delete('meta/:type/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMeta(@CurrentUser() me: AuthUser, @Param('type', metaType) type: MetaType, @Param('id', uuid) id: string) {
    return this.admin.removeMeta(me, type, id);
  }

  @Get('audit-logs')
  auditLogs(@Query(new ZodValidationPipe(auditQuerySchema)) q: Q<typeof auditQuerySchema>) {
    return this.admin.auditLogs(q);
  }
}

@Module({ imports: [AuthModule], controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
