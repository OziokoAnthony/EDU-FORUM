import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  closeVacancySchema,
  createVacancySchema,
  myVacanciesQuerySchema,
  updateVacancySchema,
  type MyVacancyResponse,
  type Paginated,
  type VacancyResponse,
} from '@edu-forum/shared';
import type { z } from 'zod';
import { CurrentUser, Public, RequireVerified, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { VacanciesService } from './vacancies.service';

const uuid = new ParseUUIDPipe();

/**
 * PRD "Vacancies" endpoints. Posting is for principals and directors (`leader`); the PRD's
 * GET /schools/me/vacancies is GET /vacancies/mine (no school accounts, user 2026-10-31).
 * Search (GET /vacancies) arrives in Phase 7.
 */
@Controller('vacancies')
export class VacanciesController {
  constructor(private readonly vacancies: VacanciesService) {}

  @Get('mine')
  @Roles('leader')
  @RequireVerified()
  listMine(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(myVacanciesQuerySchema)) query: z.output<typeof myVacanciesQuerySchema>,
  ): Promise<Paginated<MyVacancyResponse>> {
    return this.vacancies.listMine(user, query);
  }

  @Get('mine/:id')
  @Roles('leader')
  @RequireVerified()
  getMine(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string): Promise<MyVacancyResponse> {
    return this.vacancies.getMine(user, id);
  }

  /** Public detail; the school is hidden on anonymous vacancies (see the serializer). */
  @Get(':id')
  @Public()
  get(@CurrentUser() user: AuthUser | undefined, @Param('id', uuid) id: string): Promise<VacancyResponse> {
    return this.vacancies.getPublic(user, id);
  }

  @Post()
  @Roles('leader')
  @RequireVerified()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createVacancySchema)) body: z.output<typeof createVacancySchema>,
  ): Promise<MyVacancyResponse> {
    return this.vacancies.create(user, body);
  }

  @Patch(':id')
  @Roles('leader')
  @RequireVerified()
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateVacancySchema)) body: z.output<typeof updateVacancySchema>,
  ): Promise<MyVacancyResponse> {
    return this.vacancies.update(user, id, body);
  }

  @Post(':id/publish')
  @Roles('leader')
  @RequireVerified()
  @HttpCode(HttpStatus.OK)
  publish(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string): Promise<MyVacancyResponse> {
    return this.vacancies.transition(user, id, 'publish');
  }

  @Post(':id/pause')
  @Roles('leader')
  @RequireVerified()
  @HttpCode(HttpStatus.OK)
  pause(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string): Promise<MyVacancyResponse> {
    return this.vacancies.transition(user, id, 'pause');
  }

  @Post(':id/close')
  @Roles('leader')
  @RequireVerified()
  @HttpCode(HttpStatus.OK)
  close(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(closeVacancySchema)) body: z.output<typeof closeVacancySchema>,
  ): Promise<MyVacancyResponse> {
    return this.vacancies.transition(user, id, 'close', body);
  }

  @Post(':id/duplicate')
  @Roles('leader')
  @RequireVerified()
  duplicate(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string): Promise<MyVacancyResponse> {
    return this.vacancies.duplicate(user, id);
  }

  @Delete(':id')
  @Roles('leader')
  @RequireVerified()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string): Promise<void> {
    return this.vacancies.remove(user, id);
  }
}
