import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { uploadRefSchema, type CvResponse, type MyCvResponse } from '@edu-forum/shared';
import type { z } from 'zod';
import { CurrentUser, RequireVerified, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CvService } from './cv.service';

/** PRD "CV" endpoints. The file itself goes through POST /uploads/sign first. */
@Controller('teachers/me/cv')
@Roles('teacher')
@RequireVerified()
export class CvController {
  constructor(private readonly cv: CvService) {}

  /** Upload or replace; the new file becomes active once its virus scan is clean. */
  @Post()
  upload(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(uploadRefSchema)) body: z.output<typeof uploadRefSchema>,
  ): Promise<CvResponse> {
    return this.cv.upload(user.id, body.uploadId);
  }

  @Get()
  getMine(@CurrentUser() user: AuthUser): Promise<MyCvResponse> {
    return this.cv.getMine(user.id);
  }

  @Get('history')
  async history(@CurrentUser() user: AuthUser): Promise<{ data: CvResponse[] }> {
    return { data: await this.cv.history(user.id) };
  }

  /** Old versions only; the active CV cannot be deleted. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.cv.remove(user.id, id);
  }
}
