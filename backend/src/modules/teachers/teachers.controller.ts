import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import {
  certificationSchema,
  certificationUpdateSchema,
  experienceSchema,
  experienceUpdateSchema,
  locationSchema,
  personalSchema,
  preferencesSchema,
  qualificationSchema,
  qualificationUpdateSchema,
  uploadRefSchema,
} from '@edu-forum/shared';
import type { z } from 'zod';
import { CurrentUser, RequireVerified, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CertificationsService } from './certifications.service';
import { ExperiencesService } from './experiences.service';
import { QualificationsService } from './qualifications.service';
import { TeachersService } from './teachers.service';

const id = new ParseUUIDPipe();

/** PRD "Teachers" endpoints for the signed-in teacher (FR-2 onboarding wizard). */
@Controller('teachers/me')
@Roles('teacher')
@RequireVerified()
export class TeachersController {
  constructor(
    private readonly teachers: TeachersService,
    private readonly qualifications: QualificationsService,
    private readonly certifications: CertificationsService,
    private readonly experiences: ExperiencesService,
  ) {}

  @Get()
  getMine(@CurrentUser() user: AuthUser) {
    return this.teachers.getMine(user.id);
  }

  @Patch('personal')
  personal(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(personalSchema)) body: z.output<typeof personalSchema>) {
    return this.teachers.updatePersonal(user.id, body);
  }

  @Put('location')
  location(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(locationSchema)) body: z.output<typeof locationSchema>) {
    return this.teachers.updateLocation(user.id, body);
  }

  @Put('preferences')
  preferences(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(preferencesSchema)) body: z.output<typeof preferencesSchema>,
  ) {
    return this.teachers.updatePreferences(user.id, body);
  }

  @Post('photo')
  photo(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(uploadRefSchema)) body: z.output<typeof uploadRefSchema>) {
    return this.teachers.setPhoto(user.id, body.uploadId);
  }

  @Get('completeness')
  completeness(@CurrentUser() user: AuthUser) {
    return this.teachers.getCompleteness(user.id);
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  publish(@CurrentUser() user: AuthUser) {
    return this.teachers.publish(user.id);
  }

  @Post('unpublish')
  @HttpCode(HttpStatus.OK)
  unpublish(@CurrentUser() user: AuthUser) {
    return this.teachers.unpublish(user.id);
  }

  // ───────────── qualifications ─────────────

  @Get('qualifications')
  async listQualifications(@CurrentUser() user: AuthUser) {
    return { data: await this.qualifications.list(user.id) };
  }

  @Post('qualifications')
  addQualification(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(qualificationSchema)) body: z.output<typeof qualificationSchema>,
  ) {
    return this.qualifications.create(user.id, body);
  }

  @Patch('qualifications/:id')
  editQualification(
    @CurrentUser() user: AuthUser,
    @Param('id', id) qualificationId: string,
    @Body(new ZodValidationPipe(qualificationUpdateSchema)) body: z.output<typeof qualificationUpdateSchema>,
  ) {
    return this.qualifications.update(user.id, qualificationId, body);
  }

  @Delete('qualifications/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeQualification(@CurrentUser() user: AuthUser, @Param('id', id) qualificationId: string) {
    return this.qualifications.remove(user.id, qualificationId);
  }

  // ───────────── certifications ─────────────

  @Get('certifications')
  async listCertifications(@CurrentUser() user: AuthUser) {
    return { data: await this.certifications.list(user.id) };
  }

  @Post('certifications')
  addCertification(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(certificationSchema)) body: z.output<typeof certificationSchema>,
  ) {
    return this.certifications.create(user.id, body);
  }

  @Patch('certifications/:id')
  editCertification(
    @CurrentUser() user: AuthUser,
    @Param('id', id) certificationId: string,
    @Body(new ZodValidationPipe(certificationUpdateSchema)) body: z.output<typeof certificationUpdateSchema>,
  ) {
    return this.certifications.update(user.id, certificationId, body);
  }

  @Delete('certifications/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCertification(@CurrentUser() user: AuthUser, @Param('id', id) certificationId: string) {
    return this.certifications.remove(user.id, certificationId);
  }

  // ───────────── work experience ─────────────

  @Get('experiences')
  async listExperiences(@CurrentUser() user: AuthUser) {
    return { data: await this.experiences.list(user.id) };
  }

  @Post('experiences')
  addExperience(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(experienceSchema)) body: z.output<typeof experienceSchema>,
  ) {
    return this.experiences.create(user.id, body);
  }

  @Patch('experiences/:id')
  editExperience(
    @CurrentUser() user: AuthUser,
    @Param('id', id) experienceId: string,
    @Body(new ZodValidationPipe(experienceUpdateSchema)) body: z.output<typeof experienceUpdateSchema>,
  ) {
    return this.experiences.update(user.id, experienceId, body);
  }

  @Delete('experiences/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeExperience(@CurrentUser() user: AuthUser, @Param('id', id) experienceId: string) {
    return this.experiences.remove(user.id, experienceId);
  }
}
