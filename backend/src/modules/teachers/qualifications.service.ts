import { HttpStatus, Injectable } from '@nestjs/common';
import type { QualificationResponse, qualificationSchema, qualificationUpdateSchema } from '@edu-forum/shared';
import type { z } from 'zod';
import { ApiException } from '../../common/filters/api-exception.filter';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { CompletenessService } from './completeness.service';
import { ReferenceCheckService } from '../meta/reference-check.service';
import { TeacherProfilesService } from './teacher-profiles.service';
import { toQualificationResponse } from './teacher.mapper';

/** FR-2 step 3: at least one qualification; the last one cannot be deleted. */
@Injectable()
export class QualificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: TeacherProfilesService,
    private readonly completeness: CompletenessService,
    private readonly refs: ReferenceCheckService,
    private readonly uploads: UploadsService,
  ) {}

  async list(userId: string): Promise<QualificationResponse[]> {
    const profile = await this.profiles.ensure(userId);
    const rows = await this.prisma.qualification.findMany({
      where: { teacherId: profile.id, deletedAt: null },
      include: { type: true },
      orderBy: { yearObtained: 'desc' },
    });
    const files = await this.profiles.fileStatuses(rows.map((r) => r.fileKey));
    return rows.map((r) => toQualificationResponse(r, files));
  }

  async create(userId: string, input: z.output<typeof qualificationSchema>): Promise<QualificationResponse> {
    await this.refs.qualificationType(input.qualificationTypeId);
    const profile = await this.profiles.ensure(userId);
    const upload = input.fileUploadId ? await this.uploads.claim(userId, input.fileUploadId, 'qualification_file') : null;
    const row = await this.prisma.qualification.create({
      data: {
        teacherId: profile.id,
        qualificationTypeId: input.qualificationTypeId,
        course: input.course,
        institution: input.institution,
        yearObtained: input.yearObtained,
        fileKey: upload?.objectKey,
      },
    });
    if (upload) await this.uploads.enqueueScan(upload.id);
    await this.profiles.markStep(profile, 'qualifications');
    await this.completeness.refresh(profile.id);
    return this.get(profile.id, row.id);
  }

  async update(userId: string, id: string, input: z.output<typeof qualificationUpdateSchema>): Promise<QualificationResponse> {
    const profile = await this.profiles.ensure(userId);
    const current = await this.find(profile.id, id);
    if (input.qualificationTypeId) await this.refs.qualificationType(input.qualificationTypeId);
    const upload = input.fileUploadId ? await this.uploads.claim(userId, input.fileUploadId, 'qualification_file') : null;
    await this.prisma.qualification.update({
      where: { id },
      data: {
        qualificationTypeId: input.qualificationTypeId,
        course: input.course,
        institution: input.institution,
        yearObtained: input.yearObtained,
        fileKey: upload?.objectKey,
      },
    });
    if (upload) {
      await this.uploads.enqueueScan(upload.id);
      if (current.fileKey) await this.uploads.deleteObject(current.fileKey).catch(() => undefined);
    }
    return this.get(profile.id, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const profile = await this.profiles.ensure(userId);
    const current = await this.find(profile.id, id);
    const count = await this.prisma.qualification.count({ where: { teacherId: profile.id, deletedAt: null } });
    if (count <= 1) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'BUSINESS_RULE',
        'You need at least one qualification. Add another before removing this one.',
      );
    }
    await this.prisma.qualification.update({ where: { id }, data: { deletedAt: new Date() } });
    if (current.fileKey) await this.uploads.deleteObject(current.fileKey).catch(() => undefined);
    await this.completeness.refresh(profile.id);
  }

  private async find(teacherId: string, id: string) {
    // Another teacher's row is reported as not found, never as forbidden.
    const row = await this.prisma.qualification.findFirst({ where: { id, teacherId, deletedAt: null } });
    if (!row) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Qualification not found');
    return row;
  }

  private async get(teacherId: string, id: string): Promise<QualificationResponse> {
    const row = await this.prisma.qualification.findFirstOrThrow({ where: { id, teacherId }, include: { type: true } });
    return toQualificationResponse(row, await this.profiles.fileStatuses([row.fileKey]));
  }
}
