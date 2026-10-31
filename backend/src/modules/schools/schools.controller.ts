import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  createSchoolSchema,
  inviteMemberSchema,
  memberRoleSchema,
  schoolLocationSchema,
  updateSchoolSchema,
  uploadRefSchema,
  type InvitePreviewResponse,
  type LogoUploadResponse,
  type MembersResponse,
  type SchoolInviteResponse,
  type SchoolResponse,
} from '@edu-forum/shared';
import type { z } from 'zod';
import { CurrentUser, Public, RequireVerified, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentMembership, SchoolGuard, SchoolOwner } from '../../common/auth/school.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { SchoolMember } from '../../generated/prisma/client';
import { SchoolTeamService } from './school-team.service';
import { SchoolsService } from './schools.service';

const uuid = new ParseUUIDPipe();

@Controller('schools')
export class SchoolsController {
  constructor(
    private readonly schools: SchoolsService,
    private readonly team: SchoolTeamService,
  ) {}

  /** PRD: POST /schools (S), create the school during onboarding. */
  @Post()
  @Roles('school')
  @RequireVerified()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSchoolSchema)) body: z.output<typeof createSchoolSchema>,
  ): Promise<SchoolResponse> {
    return this.schools.create(user.id, body);
  }

  /** Join page preview (added to the endpoint list in CLAUDE.md, 2026-10-31). */
  @Get('invites/:token')
  @Public()
  preview(@Param('token') token: string): Promise<InvitePreviewResponse> {
    return this.team.preview(token);
  }

  /** PRD: POST /schools/invites/:token/accept (Any signed-in user; the email must match). */
  @Post('invites/:token/accept')
  @HttpCode(HttpStatus.OK)
  accept(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.team.accept(user.id, token);
  }
}

/** The caller's own school (`/schools/me/*`). SchoolGuard resolves it; @SchoolOwner() = "SO". */
@Controller('schools/me')
@Roles('school')
@RequireVerified()
@UseGuards(SchoolGuard)
export class MySchoolController {
  constructor(
    private readonly schools: SchoolsService,
    private readonly team: SchoolTeamService,
  ) {}

  @Get()
  get(@CurrentMembership() membership: SchoolMember): Promise<SchoolResponse> {
    return this.schools.getMine(membership);
  }

  @Patch()
  @SchoolOwner()
  update(
    @CurrentMembership() membership: SchoolMember,
    @Body(new ZodValidationPipe(updateSchoolSchema)) body: z.output<typeof updateSchoolSchema>,
  ): Promise<SchoolResponse> {
    return this.schools.update(membership, body);
  }

  @Put('location')
  @SchoolOwner()
  location(
    @CurrentMembership() membership: SchoolMember,
    @Body(new ZodValidationPipe(schoolLocationSchema)) body: z.output<typeof schoolLocationSchema>,
  ): Promise<SchoolResponse> {
    return this.schools.setLocation(membership, body);
  }

  @Post('logo')
  @SchoolOwner()
  logo(
    @CurrentMembership() membership: SchoolMember,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(uploadRefSchema)) body: z.output<typeof uploadRefSchema>,
  ): Promise<LogoUploadResponse> {
    return this.schools.setLogo(membership, user.id, body.uploadId);
  }

  @Get('members')
  members(@CurrentMembership() membership: SchoolMember, @CurrentUser() user: AuthUser): Promise<MembersResponse> {
    return this.team.list(membership, user.id);
  }

  @Post('members/invite')
  @SchoolOwner()
  invite(
    @CurrentMembership() membership: SchoolMember,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(inviteMemberSchema)) body: z.output<typeof inviteMemberSchema>,
  ): Promise<SchoolInviteResponse> {
    return this.team.invite(membership, user.id, body);
  }

  @Patch('members/:userId')
  @SchoolOwner()
  @HttpCode(HttpStatus.NO_CONTENT)
  changeRole(
    @CurrentMembership() membership: SchoolMember,
    @Param('userId', uuid) userId: string,
    @Body(new ZodValidationPipe(memberRoleSchema)) body: z.output<typeof memberRoleSchema>,
  ): Promise<void> {
    return this.team.changeRole(membership, userId, body.role);
  }

  @Delete('members/:userId')
  @SchoolOwner()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentMembership() membership: SchoolMember, @Param('userId', uuid) userId: string): Promise<void> {
    return this.team.remove(membership, userId);
  }

  /** Cancel a pending invite (added to the endpoint list in CLAUDE.md, 2026-10-31). */
  @Delete('invites/:id')
  @SchoolOwner()
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvite(@CurrentMembership() membership: SchoolMember, @Param('id', uuid) id: string): Promise<void> {
    return this.team.revoke(membership, id);
  }
}
