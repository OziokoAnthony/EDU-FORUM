import { HttpStatus, Injectable } from '@nestjs/common';
import type { ExperienceResponse, experienceSchema, experienceUpdateSchema } from '@edu-forum/shared';
import type { z } from 'zod';
import { toDbDate } from '../../common/dates';
import { ApiException } from '../../common/filters/api-exception.filter';
import type { WorkExperience } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CompletenessService } from './completeness.service';
import { ReferenceCheckService } from '../meta/reference-check.service';
import { TeacherProfilesService } from './teacher-profiles.service';
import { toExperienceResponse } from './teacher.mapper';

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Years of experience = the union of teaching-job periods (overlapping jobs count once).
 * NYSC and teaching practice satisfy the "experience" requirement but add no years.
 */
export function yearsOfExperience(rows: Pick<WorkExperience, 'kind' | 'startDate' | 'endDate' | 'isCurrent'>[], now = new Date()): number {
  const spans = rows
    .filter((r) => r.kind === 'job')
    .map((r) => [r.startDate.getTime(), (r.isCurrent || !r.endDate ? now : r.endDate).getTime()] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curStart, curEnd] = spans[0] ?? [0, 0];
  for (const [s, e] of spans.slice(1)) {
    if (s <= curEnd) curEnd = Math.max(curEnd, e);
    else {
      total += curEnd - curStart;
      [curStart, curEnd] = [s, e];
    }
  }
  total += curEnd - curStart;
  return Math.round((total / YEAR_MS) * 10) / 10;
}

/** FR-2 step 5. "No experience yet" = only NYSC / teaching-practice entries. */
@Injectable()
export class ExperiencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: TeacherProfilesService,
    private readonly completeness: CompletenessService,
    private readonly refs: ReferenceCheckService,
  ) {}

  async list(userId: string): Promise<ExperienceResponse[]> {
    const profile = await this.profiles.ensure(userId);
    const rows = await this.prisma.workExperience.findMany({
      where: { teacherId: profile.id, deletedAt: null },
      orderBy: { startDate: 'desc' },
    });
    return rows.map(toExperienceResponse);
  }

  async create(userId: string, input: z.output<typeof experienceSchema>): Promise<ExperienceResponse> {
    await this.refs.subjects(input.subjects, 'subjects');
    await this.refs.levels(input.levels, 'levels');
    const profile = await this.profiles.ensure(userId);
    const row = await this.prisma.workExperience.create({
      data: {
        teacherId: profile.id,
        kind: input.kind,
        schoolName: input.schoolName,
        role: input.role,
        subjects: [...new Set(input.subjects)],
        levels: [...new Set(input.levels)],
        startDate: toDbDate(input.startDate),
        endDate: input.isCurrent ? null : toDbDate(input.endDate ?? null),
        isCurrent: input.isCurrent,
        description: input.description ?? null,
      },
    });
    await this.profiles.markStep(profile, 'experience');
    await this.recompute(profile.id);
    return toExperienceResponse(row);
  }

  async update(userId: string, id: string, input: z.output<typeof experienceUpdateSchema>): Promise<ExperienceResponse> {
    const profile = await this.profiles.ensure(userId);
    const current = await this.find(profile.id, id);
    if (input.subjects) await this.refs.subjects(input.subjects, 'subjects');
    if (input.levels) await this.refs.levels(input.levels, 'levels');

    // Validate the merged result, since a partial edit can change only one of the dates.
    const isCurrent = input.isCurrent ?? current.isCurrent;
    const startDate = input.startDate ? toDbDate(input.startDate) : current.startDate;
    const endDate = isCurrent ? null : input.endDate !== undefined ? toDbDate(input.endDate) : current.endDate;
    if (!isCurrent && !endDate) throw invalid('endDate', 'Enter an end date, or tick "I work here now"');
    if (endDate && endDate < startDate) throw invalid('endDate', 'End date must be after the start date');

    const row = await this.prisma.workExperience.update({
      where: { id },
      data: {
        kind: input.kind,
        schoolName: input.schoolName,
        role: input.role,
        subjects: input.subjects ? [...new Set(input.subjects)] : undefined,
        levels: input.levels ? [...new Set(input.levels)] : undefined,
        startDate,
        endDate,
        isCurrent,
        description: input.description,
      },
    });
    await this.recompute(profile.id);
    return toExperienceResponse(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const profile = await this.profiles.ensure(userId);
    await this.find(profile.id, id);
    const count = await this.prisma.workExperience.count({ where: { teacherId: profile.id, deletedAt: null } });
    if (count <= 1) {
      this.profiles.assertNotPublished(
        profile,
        'A published profile needs work experience (or an NYSC / teaching-practice entry). Add another entry first, or unpublish.',
      );
    }
    await this.prisma.workExperience.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.recompute(profile.id);
  }

  private async recompute(teacherId: string): Promise<void> {
    const rows = await this.prisma.workExperience.findMany({ where: { teacherId, deletedAt: null } });
    await this.prisma.teacherProfile.update({
      where: { id: teacherId },
      data: {
        yearsExperience: yearsOfExperience(rows),
        noExperienceYet: rows.length > 0 && rows.every((r) => r.kind !== 'job'),
      },
    });
    await this.completeness.refresh(teacherId);
  }

  private async find(teacherId: string, id: string) {
    const row = await this.prisma.workExperience.findFirst({ where: { id, teacherId, deletedAt: null } });
    if (!row) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Work experience not found');
    return row;
  }
}

function invalid(path: string, message: string): ApiException {
  return new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Validation failed', { issues: [{ path, message }] });
}
