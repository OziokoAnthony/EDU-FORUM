import { HttpStatus, Injectable } from '@nestjs/common';
import type { CvResponse } from '@edu-forum/shared';
import { ApiException } from '../../common/filters/api-exception.filter';
import type { Cv, TeacherProfile } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { cvViewKey, toCvResponse, type FileStatuses } from './teacher.mapper';

/** Shared plumbing for the teacher's own endpoints: the profile row, file links, steps. */
@Injectable()
export class TeacherProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  /** The profile is created on first use, so the wizard can start at any step. */
  ensure(userId: string): Promise<TeacherProfile> {
    return this.prisma.teacherProfile.upsert({ where: { userId }, update: {}, create: { userId } });
  }

  /** Remembers which wizard steps the teacher has saved (resumable onboarding). */
  async markStep(profile: TeacherProfile, step: string): Promise<void> {
    if (profile.onboardingSteps.includes(step)) return;
    await this.prisma.teacherProfile.update({
      where: { id: profile.id },
      data: { onboardingSteps: { push: step } },
    });
  }

  async fileStatuses(keys: (string | null)[]): Promise<FileStatuses> {
    const present = keys.filter((k): k is string => !!k);
    if (present.length === 0) return new Map();
    const rows = await this.prisma.upload.findMany({
      where: { objectKey: { in: present } },
      select: { objectKey: true, scanStatus: true },
    });
    return new Map(rows.map((r) => [r.objectKey, r.scanStatus]));
  }

  async cvResponse(cv: Cv): Promise<CvResponse> {
    if (cv.scanStatus !== 'clean' || cv.deletedAt) return toCvResponse(cv, { downloadUrl: null, viewUrl: null });
    const viewKey = cvViewKey(cv);
    return toCvResponse(cv, {
      downloadUrl: await this.uploads.signedUrl(cv.objectKey, { downloadName: cv.fileName }),
      viewUrl: viewKey ? await this.uploads.signedUrl(viewKey, { contentType: 'application/pdf' }) : null,
    });
  }

  photoUrl(profile: TeacherProfile): Promise<string | null> {
    return profile.photoKey ? this.uploads.signedUrl(profile.photoKey) : Promise.resolve(null);
  }

  /** Changes that would break a published profile's requirements are refused. */
  assertNotPublished(profile: TeacherProfile, message: string): void {
    if (profile.isPublished) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', message);
  }
}
