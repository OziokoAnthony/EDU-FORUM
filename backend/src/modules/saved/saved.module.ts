import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { savedQuerySchema, savedSearchSchema, saveItemSchema, updateSavedSearchSchema } from '@edu-forum/shared';
import type { z } from 'zod';
import { CurrentUser, RequireVerified, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SearchModule } from '../search/search.module';
import { SavedService } from './saved.service';

const uuid = new ParseUUIDPipe();

/** PRD "Saved items": teachers save vacancies, principals/directors save teachers. */
@Controller('saved')
@RequireVerified()
@Roles('teacher', 'leader')
export class SavedItemsController {
  constructor(private readonly saved: SavedService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(savedQuerySchema)) q: z.output<typeof savedQuerySchema>) {
    return this.saved.list(user, q);
  }

  @Post()
  save(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(saveItemSchema)) body: z.output<typeof saveItemSchema>) {
    return this.saved.save(user, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  unsave(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.saved.unsave(user, id);
  }
}

/** PRD "Saved searches" with alert frequency. */
@Controller('saved-searches')
@RequireVerified()
@Roles('teacher', 'leader')
export class SavedSearchesController {
  constructor(private readonly saved: SavedService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.saved.searches(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(savedSearchSchema)) body: z.output<typeof savedSearchSchema>) {
    return this.saved.createSearch(user, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(updateSavedSearchSchema)) body: z.output<typeof updateSavedSearchSchema>) {
    return this.saved.updateSearch(user, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.saved.deleteSearch(user, id);
  }
}

@Module({ imports: [SearchModule], controllers: [SavedItemsController, SavedSearchesController], providers: [SavedService] })
export class SavedModule {}
