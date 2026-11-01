import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Post, Put, Query, Redirect } from '@nestjs/common';
import { calendarEventSchema, calendarQuerySchema, createMaterialSchema, createTimetableSchema, materialsQuerySchema } from '@edu-forum/shared';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public, RequireVerified, Roles } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SeoModule } from '../seo/seo.module';
import { UploadsModule } from '../uploads/uploads.module';
import { ResourcesService } from './resources.service';

type Q<T extends z.ZodType> = z.output<T>;
const uuid = new ParseUUIDPipe();
const slugParam = new ZodValidationPipe(z.string().trim().min(1).max(200).regex(/^[a-z0-9-]+$/));

/** Public resource lists and pages; members download materials (user, 2026-11-01). */
@Controller()
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get('materials')
  @Public()
  materials(@Query(new ZodValidationPipe(materialsQuerySchema)) q: Q<typeof materialsQuerySchema>) {
    return this.resources.materials(q);
  }

  @Get('materials/by-slug/:slug')
  @Public()
  material(@Param('slug', slugParam) slug: string) {
    return this.resources.materialBySlug(slug);
  }

  @Get('materials/:id/download')
  @Roles('teacher', 'leader', 'admin')
  @RequireVerified()
  download(@Param('id', uuid) id: string) {
    return this.resources.downloadMaterial(id);
  }

  @Get('calendar')
  @Public()
  calendar(@Query(new ZodValidationPipe(calendarQuerySchema)) q: Q<typeof calendarQuerySchema>) {
    return this.resources.calendar(q);
  }

  @Get('exams')
  @Public()
  exams() {
    return this.resources.exams();
  }

  @Get('exams/:slug')
  @Public()
  exam(@Param('slug', slugParam) slug: string) {
    return this.resources.exam(slug);
  }

  /** Official timetables are public: redirect to a fresh 10-minute link. */
  @Get('exams/timetables/:id/file')
  @Public()
  @Redirect()
  @Header('Cache-Control', 'public, max-age=300')
  async timetable(@Param('id', uuid) id: string) {
    return { url: await this.resources.timetableUrl(id), statusCode: HttpStatus.FOUND };
  }

  @Get('seo/sitemap/resources')
  @Public()
  sitemap() {
    return this.resources.sitemap();
  }
}

/** Admin uploads and calendar editing (audit-logged). */
@Controller('admin')
@Roles('admin')
export class AdminResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get('materials')
  materials() {
    return this.resources.adminMaterials();
  }

  @Post('materials')
  createMaterial(@CurrentUser() me: AuthUser, @Body(new ZodValidationPipe(createMaterialSchema)) body: Q<typeof createMaterialSchema>) {
    return this.resources.createMaterial(me, body);
  }

  @Delete('materials/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMaterial(@CurrentUser() me: AuthUser, @Param('id', uuid) id: string) {
    return this.resources.deleteMaterial(me, id);
  }

  @Get('calendar')
  calendar() {
    return this.resources.adminCalendar();
  }

  @Post('calendar')
  createEvent(@CurrentUser() me: AuthUser, @Body(new ZodValidationPipe(calendarEventSchema)) body: Q<typeof calendarEventSchema>) {
    return this.resources.saveEvent(me, body);
  }

  @Put('calendar/:id')
  updateEvent(@CurrentUser() me: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(calendarEventSchema)) body: Q<typeof calendarEventSchema>) {
    return this.resources.saveEvent(me, body, id);
  }

  @Delete('calendar/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteEvent(@CurrentUser() me: AuthUser, @Param('id', uuid) id: string) {
    return this.resources.deleteEvent(me, id);
  }

  @Get('exams/timetables')
  timetables() {
    return this.resources.adminTimetables();
  }

  @Post('exams/timetables')
  createTimetable(@CurrentUser() me: AuthUser, @Body(new ZodValidationPipe(createTimetableSchema)) body: Q<typeof createTimetableSchema>) {
    return this.resources.createTimetable(me, body);
  }

  @Delete('exams/timetables/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTimetable(@CurrentUser() me: AuthUser, @Param('id', uuid) id: string) {
    return this.resources.deleteTimetable(me, id);
  }
}

@Module({
  imports: [UploadsModule, SeoModule],
  controllers: [ResourcesController, AdminResourcesController],
  providers: [ResourcesService],
})
export class ResourcesModule {}
