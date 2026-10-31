import { HttpStatus, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  slugify,
  type createSchoolSchema,
  type LogoUploadResponse,
  type schoolLocationSchema,
  type SchoolResponse,
  type updateSchoolSchema,
} from '@edu-forum/shared';
import type { z } from 'zod';
import { ApiException } from '../../common/filters/api-exception.filter';
import type { SchoolMember, Upload } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ReferenceCheckService } from '../meta/reference-check.service';
import { UploadsService, type ScanOutcome } from '../uploads/uploads.service';

/** FR-3 school onboarding: details, location, contact person and logo. */
@Injectable()
export class SchoolsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refs: ReferenceCheckService,
    private readonly uploads: UploadsService,
  ) {}

  onModuleInit(): void {
    this.uploads.onScanned('school_logo', (upload, outcome) => this.logoScanned(upload, outcome));
  }

  /** POST /schools: the signed-up school owner creates their school (one school per person). */
  async create(userId: string, input: z.output<typeof createSchoolSchema>): Promise<SchoolResponse> {
    const existing = await this.prisma.schoolMember.findFirst({ where: { userId, status: 'active', deletedAt: null } });
    if (existing) throw new ApiException(HttpStatus.CONFLICT, 'CONFLICT', 'You already belong to a school');

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const school = await this.prisma.$transaction(async (tx) => {
      const created = await tx.school.create({
        data: {
          name: input.name,
          slug: await this.uniqueSlug(input.name),
          type: input.type,
          ownership: input.ownership,
          curriculum: [...new Set(input.curriculum)],
          populationBand: input.populationBand ?? null,
          website: input.website ?? null,
          description: input.description ?? null,
          // Confirmed: the contact person starts as the owner's own email/phone (editable).
          contactEmail: user.email,
          contactPhone: user.phone,
          onboardingSteps: ['details'],
        },
      });
      await tx.schoolMember.create({ data: { schoolId: created.id, userId, role: 'owner' } });
      await tx.user.update({ where: { id: userId }, data: { role: 'school_owner' } });
      return created;
    });
    return this.get(school.id, 'owner');
  }

  getMine(membership: SchoolMember): Promise<SchoolResponse> {
    return this.get(membership.schoolId, membership.role);
  }

  /** PATCH /schools/me: details and/or contact person. The slug never changes (SEO rule). */
  async update(membership: SchoolMember, input: z.output<typeof updateSchoolSchema>): Promise<SchoolResponse> {
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: membership.schoolId } });
    const contactTouched = ['contactName', 'contactTitle', 'contactPhone', 'contactEmail'].some(
      (k) => input[k as keyof typeof input] !== undefined,
    );
    await this.prisma.school.update({
      where: { id: school.id },
      data: {
        name: input.name,
        type: input.type,
        ownership: input.ownership,
        curriculum: input.curriculum ? [...new Set(input.curriculum)] : undefined,
        populationBand: input.populationBand,
        website: input.website,
        description: input.description,
        contactName: input.contactName,
        contactTitle: input.contactTitle,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        onboardingSteps: contactTouched && !school.onboardingSteps.includes('contact') ? { push: 'contact' } : undefined,
      },
    });
    return this.get(school.id, membership.role);
  }

  /** PUT /schools/me/location (required; full address). geog comes from lat/lng via the trigger. */
  async setLocation(membership: SchoolMember, input: z.output<typeof schoolLocationSchema>): Promise<SchoolResponse> {
    await this.refs.stateAndLga(input.stateId, input.lgaId);
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: membership.schoolId } });
    await this.prisma.school.update({
      where: { id: school.id },
      data: {
        countryCode: input.countryCode,
        stateId: input.stateId,
        lgaId: input.lgaId,
        area: input.area ?? null,
        addressLine: input.addressLine,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        onboardingSteps: school.onboardingSteps.includes('location') ? undefined : { push: 'location' },
      },
    });
    return this.get(school.id, membership.role);
  }

  /** POST /schools/me/logo: replaces the logo once the virus scan is clean. */
  async setLogo(membership: SchoolMember, userId: string, uploadId: string): Promise<LogoUploadResponse> {
    const upload = await this.uploads.claim(userId, uploadId, 'school_logo');
    await this.uploads.enqueueScan(upload.id);
    const [done, school] = await Promise.all([
      this.prisma.upload.findUniqueOrThrow({ where: { id: upload.id } }),
      this.prisma.school.findUniqueOrThrow({ where: { id: membership.schoolId } }),
    ]);
    return { scanStatus: done.scanStatus, logoUrl: school.logoKey ? await this.uploads.signedUrl(school.logoKey) : null };
  }

  /** The logo belongs to the uploader's school (one school per person). */
  private async logoScanned(upload: Upload, outcome: ScanOutcome): Promise<void> {
    if (outcome !== 'clean') return;
    const schoolId = await this.schoolOf(upload.userId);
    if (!schoolId) return;
    const school = await this.prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
    if (school.logoKey && school.logoKey !== upload.objectKey) {
      await this.uploads.deleteObject(school.logoKey).catch(() => undefined);
    }
    await this.prisma.school.update({ where: { id: schoolId }, data: { logoKey: upload.objectKey } });
  }

  private async schoolOf(userId: string): Promise<string | null> {
    const m = await this.prisma.schoolMember.findFirst({ where: { userId, status: 'active', deletedAt: null } });
    return m?.schoolId ?? null;
  }

  /** "greenfield-academy", then "greenfield-academy-2", … */
  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || 'school';
    const taken = new Set(
      (await this.prisma.school.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((s) => s.slug),
    );
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }

  /** The school as its own members see it (includes the full address). */
  private async get(schoolId: string, myRole: SchoolMember['role']): Promise<SchoolResponse> {
    const s = await this.prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      include: {
        state: { select: { id: true, name: true, slug: true } },
        lga: { select: { id: true, name: true, slug: true } },
      },
    });
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      type: s.type,
      ownership: s.ownership,
      curriculum: s.curriculum as SchoolResponse['curriculum'],
      populationBand: s.populationBand,
      website: s.website,
      description: s.description,
      logoUrl: s.logoKey ? await this.uploads.signedUrl(s.logoKey) : null,
      location: {
        countryCode: s.countryCode,
        state: s.state,
        lga: s.lga,
        area: s.area,
        addressLine: s.addressLine,
        lat: s.lat,
        lng: s.lng,
      },
      contact: { name: s.contactName, title: s.contactTitle, phone: s.contactPhone, email: s.contactEmail },
      verificationStatus: s.verificationStatus,
      myRole,
    };
  }
}
