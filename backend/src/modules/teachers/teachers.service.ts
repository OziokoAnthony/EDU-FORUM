import { HttpStatus, Injectable, type OnModuleInit } from '@nestjs/common';
import type {
  CompletenessResponse,
  locationSchema,
  personalSchema,
  preferencesSchema,
  TeacherProfileResponse,
} from '@edu-forum/shared';
import type { z } from 'zod';
import { fromDbDate, toDbDate } from '../../common/dates';
import { ApiException } from '../../common/filters/api-exception.filter';
import type { TeacherProfile, Upload } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UploadsService, type ScanOutcome } from '../uploads/uploads.service';
import { CompletenessService } from './completeness.service';
import { ReferenceCheckService } from '../meta/reference-check.service';
import { TeacherProfilesService } from './teacher-profiles.service';
import { toCertificationResponse, toExperienceResponse, toQualificationResponse } from './teacher.mapper';

/** FR-2 wizard steps 1, 2 and 6, the photo, and publish/unpublish. */
@Injectable()
export class TeachersService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: TeacherProfilesService,
    private readonly completeness: CompletenessService,
    private readonly refs: ReferenceCheckService,
    private readonly uploads: UploadsService,
  ) {}

  onModuleInit(): void {
    this.uploads.onScanned('profile_photo', (upload, outcome) => this.photoScanned(upload, outcome));
  }

  /** The teacher's own full profile, including the private address and map pin. */
  async getMine(userId: string): Promise<TeacherProfileResponse> {
    await this.profiles.ensure(userId);
    const p = await this.prisma.teacherProfile.findUniqueOrThrow({
      where: { userId },
      include: {
        user: { select: { email: true, phone: true } },
        state: { select: { id: true, name: true, slug: true } },
        lga: { select: { id: true, name: true, slug: true } },
        qualifications: { where: { deletedAt: null }, include: { type: true }, orderBy: { yearObtained: 'desc' } },
        certifications: { where: { deletedAt: null }, include: { type: true }, orderBy: { createdAt: 'asc' } },
        experiences: { where: { deletedAt: null }, orderBy: { startDate: 'desc' } },
        cvs: { where: { isActive: true, deletedAt: null }, take: 1 },
      },
    });
    const files = await this.profiles.fileStatuses([
      ...p.qualifications.map((q) => q.fileKey),
      ...p.certifications.map((c) => c.fileKey),
    ]);
    return {
      id: p.id,
      fullName: p.fullName,
      gender: p.gender,
      dob: fromDbDate(p.dob),
      bio: p.bio,
      phone: p.user.phone,
      email: p.user.email,
      photoUrl: await this.profiles.photoUrl(p),
      location: {
        countryCode: p.countryCode,
        state: p.state,
        lga: p.lga,
        area: p.area,
        addressLine: p.addressLine,
        lat: p.lat,
        lng: p.lng,
      },
      willingToRelocate: p.willingToRelocate,
      preferredStates: p.preferredStates,
      subjects: p.subjects,
      levels: p.levels,
      jobTypes: p.jobTypes,
      expectedSalaryMin: p.expectedSalaryMin,
      expectedSalaryMax: p.expectedSalaryMax,
      availableFrom: fromDbDate(p.availableFrom),
      yearsExperience: p.yearsExperience,
      noExperienceYet: p.noExperienceYet,
      qualifications: p.qualifications.map((q) => toQualificationResponse(q, files)),
      certifications: p.certifications.map((c) => toCertificationResponse(c, files)),
      experiences: p.experiences.map(toExperienceResponse),
      cv: p.cvs[0] ? await this.profiles.cvResponse(p.cvs[0]) : null,
      isPublished: p.isPublished,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      completeness: await this.completeness.compute(p.id),
    };
  }

  async updatePersonal(userId: string, input: z.output<typeof personalSchema>): Promise<TeacherProfileResponse> {
    const profile = await this.profiles.ensure(userId);
    await this.prisma.teacherProfile.update({
      where: { id: profile.id },
      data: { fullName: input.fullName, gender: input.gender, dob: toDbDate(input.dob), bio: input.bio ?? null },
    });
    return this.afterStep(userId, profile, 'personal');
  }

  async updateLocation(userId: string, input: z.output<typeof locationSchema>): Promise<TeacherProfileResponse> {
    await this.refs.stateAndLga(input.stateId, input.lgaId);
    await this.refs.states(input.preferredStates, 'preferredStates');
    const profile = await this.profiles.ensure(userId);
    // geog is filled from lat/lng by the set_geog_from_lat_lng trigger.
    await this.prisma.teacherProfile.update({
      where: { id: profile.id },
      data: {
        countryCode: input.countryCode,
        stateId: input.stateId,
        lgaId: input.lgaId,
        area: input.area ?? null,
        addressLine: input.addressLine ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        willingToRelocate: input.willingToRelocate,
        preferredStates: input.willingToRelocate ? [...new Set(input.preferredStates)] : [],
      },
    });
    return this.afterStep(userId, profile, 'location');
  }

  async updatePreferences(userId: string, input: z.output<typeof preferencesSchema>): Promise<TeacherProfileResponse> {
    await this.refs.subjects(input.subjects, 'subjects');
    await this.refs.levels(input.levels, 'levels');
    const profile = await this.profiles.ensure(userId);
    await this.prisma.teacherProfile.update({
      where: { id: profile.id },
      data: {
        subjects: [...new Set(input.subjects)],
        levels: [...new Set(input.levels)],
        jobTypes: [...new Set(input.jobTypes)],
        expectedSalaryMin: input.expectedSalaryMin ?? null,
        expectedSalaryMax: input.expectedSalaryMax ?? null,
        availableFrom: toDbDate(input.availableFrom ?? null),
      },
    });
    return this.afterStep(userId, profile, 'preferences');
  }

  /** The photo replaces the current one once its scan is clean. */
  async setPhoto(userId: string, uploadId: string): Promise<{ scanStatus: string; photoUrl: string | null }> {
    const upload = await this.uploads.claim(userId, uploadId, 'profile_photo');
    await this.profiles.ensure(userId);
    await this.uploads.enqueueScan(upload.id);
    const [done, profile] = await Promise.all([
      this.prisma.upload.findUniqueOrThrow({ where: { id: upload.id } }),
      this.prisma.teacherProfile.findUniqueOrThrow({ where: { userId } }),
    ]);
    return { scanStatus: done.scanStatus, photoUrl: await this.profiles.photoUrl(profile) };
  }

  private async photoScanned(upload: Upload, outcome: ScanOutcome): Promise<void> {
    if (outcome !== 'clean') return;
    const profile = await this.prisma.teacherProfile.findUnique({ where: { userId: upload.userId } });
    if (!profile) return;
    if (profile.photoKey && profile.photoKey !== upload.objectKey) {
      await this.uploads.deleteObject(profile.photoKey).catch(() => undefined);
    }
    await this.prisma.teacherProfile.update({ where: { id: profile.id }, data: { photoKey: upload.objectKey } });
    await this.completeness.refresh(profile.id);
  }

  async getCompleteness(userId: string): Promise<CompletenessResponse> {
    const profile = await this.profiles.ensure(userId);
    return this.completeness.compute(profile.id);
  }

  /** Publish gate: 422 with details.missing listing exactly what is still required. */
  async publish(userId: string): Promise<TeacherProfileResponse> {
    const profile = await this.profiles.ensure(userId);
    const result = await this.completeness.refresh(profile.id);
    if (!result.canPublish) {
      throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', 'Complete your profile before publishing', {
        missing: result.missing,
      });
    }
    if (!profile.isPublished) {
      await this.prisma.teacherProfile.update({
        where: { id: profile.id },
        data: { isPublished: true, publishedAt: new Date() },
      });
    }
    return this.getMine(userId);
  }

  async unpublish(userId: string): Promise<TeacherProfileResponse> {
    const profile = await this.profiles.ensure(userId);
    await this.prisma.teacherProfile.update({ where: { id: profile.id }, data: { isPublished: false } });
    return this.getMine(userId);
  }

  private async afterStep(userId: string, profile: TeacherProfile, step: string): Promise<TeacherProfileResponse> {
    await this.profiles.markStep(profile, step);
    await this.completeness.refresh(profile.id);
    return this.getMine(userId);
  }
}
