import { HttpStatus, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  DEFAULT_DEADLINE_DAYS,
  slugify,
  textLength,
  DESCRIPTION_MIN_CHARS,
  vacancyRecordSchema,
  createVacancySchema,
  type closeVacancySchema,
  type MyVacancyResponse,
  type myVacanciesQuerySchema,
  type Paginated,
  type updateVacancySchema,
  type VacancyResponse,
} from '@edu-forum/shared';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { fromDbDate, toDbDate } from '../../common/dates';
import { ApiException } from '../../common/filters/api-exception.filter';
import { validate } from '../../common/pipes/zod-validation.pipe';
import { Prisma, type VacancyStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { JOB_QUEUE, type JobQueue } from '../../infra/queue/job-queue';
import { ApplicationsService } from '../applications/applications.service';
import { ReferenceCheckService } from '../meta/reference-check.service';
import { sanitizeDescription } from './sanitize-description';
import { toMyVacancyResponse, toVacancyResponse, VACANCY_INCLUDE, type VacancyRow } from './vacancy.serializer';

type VacancyFields = z.output<typeof vacancyRecordSchema>;

const DAY_MS = 24 * 60 * 60 * 1000;
const SHORT_ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
export const EXPIRE_VACANCIES_JOB = 'expire-vacancies';
/** Application statuses that reveal an anonymous vacancy's school to the teacher. */
const REVEALING_STATUSES = ['shortlisted', 'interview', 'offered', 'hired'] as const;

/** Allowed lifecycle moves: draft → published → paused ↔ published → closed. */
const TRANSITIONS: Record<'publish' | 'pause' | 'close', VacancyStatus[]> = {
  publish: ['draft', 'paused'],
  pause: ['published'],
  close: ['published', 'paused'],
};

function shortId(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => SHORT_ID_ALPHABET[b % SHORT_ID_ALPHABET.length]).join('');
}

const notFound = () => new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Vacancy not found');

/**
 * FR-4 vacancies, posted by principals and directors (user, 2026-10-31). Each poster
 * manages only their own vacancies; anonymity is enforced in the serializer.
 */
@Injectable()
export class VacanciesService implements OnModuleInit {
  private readonly logger = new Logger(VacanciesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly refs: ReferenceCheckService,
    private readonly applications: ApplicationsService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue.register(EXPIRE_VACANCIES_JOB, () => this.expire().then(() => undefined));
    await this.queue.schedule(EXPIRE_VACANCIES_JOB, '5 0 * * *');
  }

  async create(user: AuthUser, input: z.output<typeof createVacancySchema>): Promise<MyVacancyResponse> {
    const { publish, ...fields } = input;
    const data = await this.prepare(fields);
    let created: { id: string } | null = null;
    // shortId is random; retry on the (very unlikely) unique clash.
    for (let attempt = 0; !created; attempt++) {
      try {
        created = await this.prisma.vacancy.create({
          data: { ...data, createdById: user.id, slug: slugify(fields.title) || 'teaching-job', shortId: shortId() },
        });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') || attempt >= 3) throw err;
      }
    }
    if (publish) return this.transition(user, created.id, 'publish');
    return this.getMine(user, created.id);
  }

  /** Edits are allowed after publishing (PRD); the merged vacancy must still pass every rule. */
  async update(user: AuthUser, id: string, input: z.output<typeof updateVacancySchema>): Promise<MyVacancyResponse> {
    const current = await this.findOwn(user, id);
    if (current.status === 'closed') {
      throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', 'A closed vacancy cannot be edited. Duplicate it instead.');
    }
    const merged = validate(vacancyRecordSchema, { ...this.toFields(current), ...input });
    const data = await this.prepare(merged);
    // The URL slug never changes once the vacancy has been published (SEO rule).
    const slug = current.publishedAt ? current.slug : slugify(merged.title) || current.slug;
    if (current.status === 'published' && merged.deadline && merged.deadline < today()) {
      throw invalid('deadline', 'The deadline cannot be in the past');
    }
    const after = await this.prisma.vacancy.update({ where: { id }, data: { ...data, slug } });
    // PRD FR-4: salary or title changes notify applicants.
    await this.applications.notifyVacancyChange(current, after);
    return this.getMine(user, id);
  }

  async transition(user: AuthUser, id: string, action: 'publish' | 'pause' | 'close', input?: z.output<typeof closeVacancySchema>) {
    const v = await this.findOwn(user, id);
    if (!TRANSITIONS[action].includes(v.status)) {
      throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', `A ${v.status} vacancy cannot be ${action === 'publish' ? 'published' : action === 'pause' ? 'paused' : 'closed'}`);
    }
    const now = new Date();
    let data: Prisma.VacancyUpdateInput;
    if (action === 'publish') {
      const deadline = v.deadline ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DEFAULT_DEADLINE_DAYS * DAY_MS);
      if (fromDbDate(deadline)! < today()) throw invalid('deadline', 'The deadline has passed. Set a new deadline first.');
      data = { status: 'published', publishedAt: v.publishedAt ?? now, deadline };
    } else if (action === 'pause') {
      data = { status: 'paused' };
    } else {
      data = { status: 'closed', closedAt: now, closeReason: input?.reason ?? 'filled' };
    }
    await this.prisma.vacancy.update({ where: { id }, data });
    return this.getMine(user, id);
  }

  /** POST /vacancies/:id/duplicate: a new draft with the same content. */
  async duplicate(user: AuthUser, id: string): Promise<MyVacancyResponse> {
    const v = await this.findOwn(user, id);
    const fields = this.toFields(v);
    // A copy gets fresh question ids and no deadline (it is set again on publish).
    const screeningQuestions = (fields.screeningQuestions ?? []).map(({ question, type }) => ({ question, type: type ?? 'text' }));
    return this.create(user, validate(createVacancySchema, { ...fields, screeningQuestions, deadline: null, publish: false }));
  }

  /** Only drafts can be deleted (CLAUDE.md lifecycle rule). */
  async remove(user: AuthUser, id: string): Promise<void> {
    const v = await this.findOwn(user, id);
    if (v.status !== 'draft') {
      throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', 'Only drafts can be deleted. Close this vacancy instead.');
    }
    await this.prisma.vacancy.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async listMine(user: AuthUser, query: z.output<typeof myVacanciesQuerySchema>): Promise<Paginated<MyVacancyResponse>> {
    const where: Prisma.VacancyWhereInput = { createdById: user.id, deletedAt: null, status: query.status };
    const [rows, total] = await Promise.all([
      this.prisma.vacancy.findMany({
        where,
        include: { ...VACANCY_INCLUDE, _count: { select: { applications: { where: { deletedAt: null } } } } },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.vacancy.count({ where }),
    ]);
    return {
      data: rows.map((r) => toMyVacancyResponse(r, r._count.applications)),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  async getMine(user: AuthUser, id: string): Promise<MyVacancyResponse> {
    const v = await this.prisma.vacancy.findFirst({
      where: { id, createdById: user.id, deletedAt: null },
      include: { ...VACANCY_INCLUDE, _count: { select: { applications: { where: { deletedAt: null } } } } },
    });
    if (!v) throw notFound();
    return toMyVacancyResponse(v, v._count.applications);
  }

  /**
   * GET /vacancies/:id (public). Live and closed vacancies are public; drafts, paused and
   * taken-down ones only exist for their poster.
   */
  async getPublic(viewer: AuthUser | undefined, id: string): Promise<VacancyResponse> {
    const v = await this.prisma.vacancy.findFirst({ where: { id, deletedAt: null }, include: VACANCY_INCLUDE });
    if (!v) throw notFound();
    const isOwner = viewer?.id === v.createdById;
    const isPublic = (v.status === 'published' || v.status === 'closed') && !v.takedownReason;
    if (!isPublic && !isOwner) throw notFound();
    if (!isOwner && v.status === 'published') {
      await this.prisma.vacancy.update({ where: { id }, data: { viewsCount: { increment: 1 } } });
    }
    return toVacancyResponse(v, isOwner || (await this.revealedTo(viewer, v)));
  }

  /** A teacher sees an anonymous vacancy's school once shortlisted or invited (CLAUDE.md). */
  private async revealedTo(viewer: AuthUser | undefined, v: VacancyRow): Promise<boolean> {
    if (v.locationVisibility !== 'anonymous' || viewer?.role !== 'teacher') return false;
    const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId: viewer.id }, select: { id: true } });
    if (!teacher) return false;
    const [application, invitation] = await Promise.all([
      this.prisma.application.findFirst({
        where: { vacancyId: v.id, teacherId: teacher.id, deletedAt: null, status: { in: [...REVEALING_STATUSES] } },
        select: { id: true },
      }),
      this.prisma.invitation.findFirst({
        where: { vacancyId: v.id, teacherId: teacher.id, deletedAt: null, status: { in: ['pending', 'accepted'] } },
        select: { id: true },
      }),
    ]);
    return !!(application || invitation);
  }

  /** Nightly: live vacancies past their deadline close as "expired". */
  async expire(now = new Date()): Promise<number> {
    const { count } = await this.prisma.vacancy.updateMany({
      where: { status: 'published', deletedAt: null, deadline: { lt: toDbDate(fromDbDate(now)!) } },
      data: { status: 'closed', closedAt: now, closeReason: 'expired' },
    });
    if (count) this.logger.log(`Closed ${count} expired vacancies`);
    return count;
  }

  private async findOwn(user: AuthUser, id: string) {
    // Someone else's vacancy is reported as not found, never as forbidden.
    const v = await this.prisma.vacancy.findFirst({ where: { id, createdById: user.id, deletedAt: null }, include: VACANCY_INCLUDE });
    if (!v) throw notFound();
    return v;
  }

  /** Checks reference lists and sanitises the description; returns the columns to write. */
  private async prepare(f: VacancyFields) {
    await this.refs.stateAndLga(f.stateId, f.lgaId);
    await this.refs.subjects(f.subjects, 'subjects');
    await this.refs.levels(f.levels, 'levels');
    await this.refs.qualificationTypes(f.requiredQualifications, 'requiredQualifications');
    await this.refs.certificationTypes(f.requiredCertifications, 'requiredCertifications');

    const description = sanitizeDescription(f.description);
    if (textLength(description) < DESCRIPTION_MIN_CHARS) {
      throw invalid('description', `Write at least ${DESCRIPTION_MIN_CHARS} characters`);
    }
    return {
      title: f.title,
      subjects: [...new Set(f.subjects)],
      levels: [...new Set(f.levels)],
      jobType: f.jobType,
      salaryMin: f.salaryMin,
      salaryMax: f.salaryMax,
      salaryCurrency: f.salaryCurrency,
      salaryPeriod: f.salaryPeriod,
      description,
      locationVisibility: f.locationVisibility,
      schoolName: f.schoolName ?? null,
      schoolType: f.schoolType ?? null,
      countryCode: 'NG',
      stateId: f.stateId,
      lgaId: f.lgaId,
      area: f.area ?? null,
      addressLine: f.addressLine ?? null,
      lat: f.lat ?? null,
      lng: f.lng ?? null,
      requiredQualifications: [...new Set(f.requiredQualifications)],
      minExperienceYears: f.minExperienceYears ?? null,
      requiredCertifications: [...new Set(f.requiredCertifications)],
      openings: f.openings,
      benefits: [...new Set(f.benefits)],
      screeningQuestions: f.screeningQuestions.map((q) => ({ ...q, id: q.id ?? randomUUID() })),
      deadline: toDbDate(f.deadline ?? null),
      startDate: toDbDate(f.startDate ?? null),
    };
  }

  /** A stored vacancy as schema input, for merging an edit or duplicating. */
  private toFields(v: VacancyRow): z.input<typeof vacancyRecordSchema> {
    return {
      title: v.title,
      subjects: v.subjects,
      levels: v.levels,
      jobType: v.jobType,
      salaryMin: v.salaryMin,
      salaryMax: v.salaryMax,
      salaryCurrency: 'NGN',
      salaryPeriod: v.salaryPeriod,
      description: v.description,
      locationVisibility: v.locationVisibility,
      schoolName: v.schoolName ?? undefined,
      schoolType: v.schoolType,
      stateId: v.stateId,
      lgaId: v.lgaId,
      area: v.area ?? undefined,
      addressLine: v.addressLine ?? undefined,
      lat: v.lat,
      lng: v.lng,
      requiredQualifications: v.requiredQualifications,
      minExperienceYears: v.minExperienceYears,
      requiredCertifications: v.requiredCertifications,
      openings: v.openings,
      benefits: v.benefits as VacancyFields['benefits'],
      screeningQuestions: v.screeningQuestions as { id: string; question: string; type: 'text' | 'yes_no' }[],
      deadline: fromDbDate(v.deadline),
      startDate: fromDbDate(v.startDate),
    };
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function invalid(path: string, message: string): ApiException {
  return new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Validation failed', { issues: [{ path, message }] });
}
