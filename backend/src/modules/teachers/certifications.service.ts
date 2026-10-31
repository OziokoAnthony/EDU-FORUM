import { HttpStatus, Injectable } from '@nestjs/common';
import type { CertificationResponse, certificationSchema, certificationUpdateSchema } from '@edu-forum/shared';
import type { z } from 'zod';
import { toDbDate } from '../../common/dates';
import { ApiException } from '../../common/filters/api-exception.filter';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { ReferenceCheckService } from '../meta/reference-check.service';
import { TeacherProfilesService } from './teacher-profiles.service';
import { toCertificationResponse } from './teacher.mapper';

/**
 * FR-2 step 4: TRCN and other certificates with issuer, number, dates and file. Optional
 * (TRCN is optional, confirmed 2026-10-31). Any edit sends the certificate back to review.
 */
@Injectable()
export class CertificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: TeacherProfilesService,
    private readonly refs: ReferenceCheckService,
    private readonly uploads: UploadsService,
  ) {}

  async list(userId: string): Promise<CertificationResponse[]> {
    const profile = await this.profiles.ensure(userId);
    const rows = await this.prisma.certification.findMany({
      where: { teacherId: profile.id, deletedAt: null },
      include: { type: true },
      orderBy: { createdAt: 'asc' },
    });
    const files = await this.profiles.fileStatuses(rows.map((r) => r.fileKey));
    return rows.map((r) => toCertificationResponse(r, files));
  }

  async create(userId: string, input: z.output<typeof certificationSchema>): Promise<CertificationResponse> {
    await this.refs.certificationType(input.certificationTypeId);
    const profile = await this.profiles.ensure(userId);
    const upload = await this.uploads.claim(userId, input.fileUploadId, 'certification_file');
    const row = await this.prisma.certification.create({
      data: {
        teacherId: profile.id,
        certificationTypeId: input.certificationTypeId,
        issuer: input.issuer,
        number: input.number,
        issuedAt: toDbDate(input.issuedAt),
        expiresAt: toDbDate(input.expiresAt),
        fileKey: upload.objectKey,
      },
    });
    await this.uploads.enqueueScan(upload.id);
    await this.profiles.markStep(profile, 'certifications');
    return this.get(profile.id, row.id);
  }

  async update(userId: string, id: string, input: z.output<typeof certificationUpdateSchema>): Promise<CertificationResponse> {
    const profile = await this.profiles.ensure(userId);
    const current = await this.find(profile.id, id);
    if (input.certificationTypeId) await this.refs.certificationType(input.certificationTypeId);
    const issuedAt = input.issuedAt ?? current.issuedAt?.toISOString().slice(0, 10);
    const expiresAt = input.expiresAt === undefined ? current.expiresAt?.toISOString().slice(0, 10) : input.expiresAt;
    if (issuedAt && expiresAt && expiresAt < issuedAt) {
      throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Validation failed', {
        issues: [{ path: 'expiresAt', message: 'Expiry date must be after the issue date' }],
      });
    }
    const upload = input.fileUploadId ? await this.uploads.claim(userId, input.fileUploadId, 'certification_file') : null;
    await this.prisma.certification.update({
      where: { id },
      data: {
        certificationTypeId: input.certificationTypeId,
        issuer: input.issuer,
        number: input.number,
        issuedAt: toDbDate(input.issuedAt),
        expiresAt: toDbDate(input.expiresAt),
        fileKey: upload?.objectKey,
        verificationStatus: 'pending',
        reviewedById: null,
        reviewedAt: null,
        rejectionReason: null,
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
    await this.prisma.certification.update({ where: { id }, data: { deletedAt: new Date() } });
    if (current.fileKey) await this.uploads.deleteObject(current.fileKey).catch(() => undefined);
  }

  private async find(teacherId: string, id: string) {
    const row = await this.prisma.certification.findFirst({ where: { id, teacherId, deletedAt: null } });
    if (!row) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Certification not found');
    return row;
  }

  private async get(teacherId: string, id: string): Promise<CertificationResponse> {
    const row = await this.prisma.certification.findFirstOrThrow({ where: { id, teacherId }, include: { type: true } });
    return toCertificationResponse(row, await this.profiles.fileStatuses([row.fileKey]));
  }
}
