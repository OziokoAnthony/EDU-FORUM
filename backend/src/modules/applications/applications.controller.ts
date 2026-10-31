import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  applicantsQuerySchema,
  applySchema,
  bulkStatusSchema,
  cvLinkQuerySchema,
  moveStatusSchema,
  myApplicationsQuerySchema,
  noteSchema,
  ratingSchema,
} from '@edu-forum/shared';
import type { z } from 'zod';
import { CurrentUser, RequireVerified, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApplicationsService } from './applications.service';

const uuid = new ParseUUIDPipe();

/** PRD "Applications" endpoints under /vacancies/:id/… (apply, applicants, bulk, CSV). */
@Controller('vacancies/:vacancyId/applications')
@RequireVerified()
export class VacancyApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post()
  @Roles('teacher')
  apply(
    @CurrentUser() user: AuthUser,
    @Param('vacancyId', uuid) vacancyId: string,
    @Body(new ZodValidationPipe(applySchema)) body: z.output<typeof applySchema>,
  ) {
    return this.applications.apply(user, vacancyId, body);
  }

  @Get()
  @Roles('leader')
  list(
    @CurrentUser() user: AuthUser,
    @Param('vacancyId', uuid) vacancyId: string,
    @Query(new ZodValidationPipe(applicantsQuerySchema)) query: z.output<typeof applicantsQuerySchema>,
  ) {
    return this.applications.listForVacancy(user, vacancyId, query);
  }

  @Post('bulk-status')
  @Roles('leader')
  @HttpCode(HttpStatus.OK)
  bulk(
    @CurrentUser() user: AuthUser,
    @Param('vacancyId', uuid) vacancyId: string,
    @Body(new ZodValidationPipe(bulkStatusSchema)) body: z.output<typeof bulkStatusSchema>,
  ) {
    return this.applications.bulkStatus(user, vacancyId, body);
  }

  /** CSV export (FR-7.4); added to the endpoint list in CLAUDE.md. */
  @Get('export')
  @Roles('leader')
  async export(@CurrentUser() user: AuthUser, @Param('vacancyId', uuid) vacancyId: string, @Res() res: Response): Promise<void> {
    const { filename, csv } = await this.applications.exportCsv(user, vacancyId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }
}

/** PRD "Applications" endpoints under /applications/… */
@Controller('applications')
@RequireVerified()
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get('me')
  @Roles('teacher')
  mine(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(myApplicationsQuerySchema)) query: z.output<typeof myApplicationsQuerySchema>) {
    return this.applications.listMine(user, query);
  }

  /** Teacher (own application) or the vacancy's poster; each gets their own view. */
  @Get(':id')
  @Roles('teacher', 'leader')
  get(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return user.role === 'teacher' ? this.applications.getForTeacher(user, id) : this.applications.getForPoster(user, id);
  }

  @Post(':id/withdraw')
  @Roles('teacher')
  @HttpCode(HttpStatus.OK)
  withdraw(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.applications.withdraw(user, id);
  }

  @Patch(':id/status')
  @Roles('leader')
  status(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(moveStatusSchema)) body: z.output<typeof moveStatusSchema>) {
    return this.applications.moveStatus(user, id, body);
  }

  @Patch(':id/rating')
  @Roles('leader')
  rating(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(ratingSchema)) body: z.output<typeof ratingSchema>) {
    return this.applications.rate(user, id, body.rating);
  }

  @Get(':id/notes')
  @Roles('leader')
  notes(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.applications.notes(user, id);
  }

  @Post(':id/notes')
  @Roles('leader')
  addNote(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(noteSchema)) body: z.output<typeof noteSchema>) {
    return this.applications.addNote(user, id, body.body);
  }

  @Delete(':id/notes/:noteId')
  @Roles('leader')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteNote(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Param('noteId', uuid) noteId: string) {
    return this.applications.deleteNote(user, id, noteId);
  }

  @Get(':id/history')
  @Roles('teacher', 'leader')
  history(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.applications.history(user, id);
  }

  /** The CV as sent with the application (snapshot); added to the endpoint list in CLAUDE.md. */
  @Get(':id/cv')
  @Roles('leader')
  cv(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Query(new ZodValidationPipe(cvLinkQuerySchema)) query: z.output<typeof cvLinkQuerySchema>) {
    return this.applications.cvLink(user, id, query.download);
  }
}
