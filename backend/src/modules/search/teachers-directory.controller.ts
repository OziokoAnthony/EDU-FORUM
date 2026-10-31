import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  cvLinkQuerySchema,
  teacherSearchSchema,
  type CvLinkResponse,
  type Paginated,
  type TeacherListItem,
  type TeacherViewResponse,
} from '@edu-forum/shared';
import type { z } from 'zod';
import { CurrentUser, RequireVerified, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TeacherSearchService } from './teacher-search.service';

const uuid = new ParseUUIDPipe();

/**
 * PRD "Teacher search (recruiter side)", for principals and directors. Registered after the
 * teachers module so `/teachers/me/*` (the teacher's own endpoints) is matched first.
 */
@Controller('teachers')
@Roles('leader')
@RequireVerified()
export class TeachersDirectoryController {
  constructor(private readonly teachers: TeacherSearchService) {}

  @Get()
  search(@Query(new ZodValidationPipe(teacherSearchSchema)) query: z.output<typeof teacherSearchSchema>): Promise<Paginated<TeacherListItem>> {
    return this.teachers.search(query);
  }

  @Get(':id')
  view(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string): Promise<TeacherViewResponse> {
    return this.teachers.view(user, id);
  }

  /** `?download=true` gives the original file; otherwise the PDF for the viewer. */
  @Get(':id/cv')
  cv(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Query(new ZodValidationPipe(cvLinkQuerySchema)) query: z.output<typeof cvLinkQuerySchema>,
  ): Promise<CvLinkResponse> {
    return this.teachers.cvLink(user, id, query.download);
  }
}
