import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CvLinkResponse, Paginated, TeacherListItem, teacherSearchSchema, TeacherViewResponse } from '@edu-forum/shared';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { fromDbDate } from '../../common/dates';
import { ApiException } from '../../common/filters/api-exception.filter';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { cvViewKey } from '../teachers/teacher.mapper';
import { UploadsService } from '../uploads/uploads.service';
import { point, teacherMatchScore } from './match-sql';

type Query = z.output<typeof teacherSearchSchema>;
type Wanted = { subjects: string[]; levels: string[]; minQualRank: number | null; minExperience: number | null; certifications: string[] };

const RECOMMENDED_LIMIT = 20;
const notFound = () => new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Teacher not found');

/** A teacher is findable when published, visible, and their account is active. */
const FINDABLE = Prisma.sql`t.is_published AND t.visibility = 'visible' AND t.deleted_at IS NULL
  AND u.status = 'active' AND u.deleted_at IS NULL`;

/**
 * Teacher search, profile view and CV links for principals and directors. Responses carry
 * state, LGA and distance only, never the street address or the map pin (CLAUDE.md pillar 1).
 * Profile views and CV views/downloads are logged (ProfileView).
 */
@Injectable()
export class TeacherSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly config: ConfigService,
  ) {}

  async search(q: Query): Promise<Paginated<TeacherListItem>> {
    const wanted: Wanted = {
      subjects: q.subjects ?? [],
      levels: q.levels ?? [],
      minQualRank: q.qualification ? await this.qualRank(q.qualification) : null,
      minExperience: q.minExperience ?? null,
      certifications: q.certification ? [q.certification] : [],
    };
    const origin = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null;

    const where: Prisma.Sql[] = [FINDABLE];
    if (q.q) {
      where.push(Prisma.sql`to_tsvector('simple', coalesce(t.full_name, '') || ' ' || coalesce(t.bio, '')) @@ websearch_to_tsquery('simple', ${q.q})`);
    }
    if (wanted.subjects.length) where.push(Prisma.sql`t.subjects && ${wanted.subjects}::text[]`);
    if (wanted.levels.length) where.push(Prisma.sql`t.levels && ${wanted.levels}::text[]`);
    if (wanted.minQualRank != null) where.push(Prisma.sql`COALESCE(tq.max_rank, 0) >= ${wanted.minQualRank}`);
    if (q.minExperience != null) where.push(Prisma.sql`t.years_experience >= ${q.minExperience}`);
    if (q.certification) where.push(Prisma.sql`${q.certification} = ANY(tc.slugs)`);
    if (q.lga) where.push(Prisma.sql`l.slug = ${q.lga}`);
    if (q.state && q.willingToRelocate) {
      // Teachers in the state, plus those willing to move there (no preference = anywhere).
      where.push(Prisma.sql`(s.slug = ${q.state} OR (t.willing_to_relocate AND (cardinality(t.preferred_states) = 0 OR ${q.state} = ANY(t.preferred_states))))`);
    } else {
      if (q.state) where.push(Prisma.sql`s.slug = ${q.state}`);
      if (q.willingToRelocate !== undefined) where.push(Prisma.sql`t.willing_to_relocate = ${q.willingToRelocate}`);
    }
    if (q.availableBy) where.push(Prisma.sql`(t.available_from IS NULL OR t.available_from <= ${q.availableBy}::date)`);
    if (q.maxSalary != null) where.push(Prisma.sql`(t.expected_salary_min IS NULL OR t.expected_salary_min <= ${q.maxSalary})`);
    if (origin && q.radiusKm) where.push(Prisma.sql`ST_DWithin(t.geog, ${point(origin.lat, origin.lng)}, ${q.radiusKm * 1000})`);

    return this.run(wanted, origin, where, q.sort, q.page, q.limit);
  }

  /** GET /vacancies/:id/recommended-teachers: the poster's own vacancy only. */
  async recommendedFor(user: AuthUser, vacancyId: string): Promise<Paginated<TeacherListItem>> {
    const v = await this.prisma.vacancy.findFirst({ where: { id: vacancyId, createdById: user.id, deletedAt: null } });
    if (!v) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Vacancy not found');
    const ranks = await this.prisma.qualificationType.findMany({ where: { slug: { in: v.requiredQualifications } }, select: { rank: true } });
    const wanted: Wanted = {
      subjects: v.subjects,
      levels: v.levels,
      minQualRank: ranks.length ? Math.min(...ranks.map((r) => r.rank)) : null,
      minExperience: v.minExperienceYears,
      certifications: v.requiredCertifications,
    };
    const origin = v.lat != null && v.lng != null ? { lat: v.lat, lng: v.lng } : null;
    const where = [
      FINDABLE,
      Prisma.sql`(t.subjects && ${v.subjects}::text[] OR t.levels && ${v.levels}::text[])`,
      // Nearby: same state, or willing to relocate there.
      Prisma.sql`(t.state_id = ${v.stateId}::uuid OR t.willing_to_relocate)`,
    ];
    return this.run(wanted, origin, where, 'match', 1, RECOMMENDED_LIMIT);
  }

  private async run(wanted: Wanted, origin: { lat: number; lng: number } | null, where: Prisma.Sql[], sort: Query['sort'], page: number, limit: number) {
    const km = origin ? Prisma.sql`(ST_Distance(t.geog, ${point(origin.lat, origin.lng)}) / 1000)` : null;
    const score = teacherMatchScore(wanted, km);
    const order = {
      // CLAUDE.md: complete profiles rank above incomplete ones.
      match: Prisma.sql`score DESC, t.completeness_score DESC, t.updated_at DESC`,
      distance: km ? Prisma.sql`km ASC NULLS LAST, score DESC` : Prisma.sql`score DESC`,
      experience: Prisma.sql`t.years_experience DESC, score DESC`,
      updated: Prisma.sql`t.updated_at DESC`,
    }[sort];
    const from = Prisma.sql`FROM teacher_profiles t
      JOIN users u ON u.id = t.user_id
      LEFT JOIN states s ON s.id = t.state_id
      LEFT JOIN lgas l ON l.id = t.lga_id
      LEFT JOIN LATERAL (SELECT max(qt.rank) AS max_rank FROM qualifications q JOIN qualification_types qt ON qt.id = q.qualification_type_id
                         WHERE q.teacher_id = t.id AND q.deleted_at IS NULL) tq ON true
      LEFT JOIN LATERAL (SELECT COALESCE(array_agg(ct.slug), '{}') AS slugs FROM certifications c JOIN certification_types ct ON ct.id = c.certification_type_id
                         WHERE c.teacher_id = t.id AND c.deleted_at IS NULL) tc ON true`;
    const whereSql = Prisma.join(where, ' AND ');
    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; score: number; km: number | null }[]>`
        SELECT t.id, ${score} AS score, ${km ?? Prisma.sql`NULL::float`} AS km
        ${from} WHERE ${whereSql}
        ORDER BY ${order}
        LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total ${from} WHERE ${whereSql}`,
    ]);
    const items = await this.listItems(rows.map((r) => r.id));
    const data = rows.map((r) => ({ ...items.get(r.id)!, matchScore: r.score, distanceKm: r.km == null ? null : Math.round(r.km) }));
    return { data, meta: { page, limit, total } };
  }

  /** GET /teachers/:id: the full profile with phone and email; logged as a profile view. */
  async view(viewer: AuthUser, teacherId: string): Promise<TeacherViewResponse> {
    const t = await this.findable(teacherId);
    const items = await this.listItems([t.id]);
    await this.prisma.profileView.create({ data: { teacherId: t.id, viewerId: viewer.id, kind: 'profile' } });
    const active = t.cvs[0];
    return {
      ...items.get(t.id)!,
      matchScore: 0,
      distanceKm: null,
      bio: t.bio,
      gender: t.gender,
      phone: t.user.phone,
      email: t.user.email,
      preferredStates: t.preferredStates,
      qualifications: t.qualifications.map((q) => ({ id: q.id, type: q.type.name, course: q.course, institution: q.institution, yearObtained: q.yearObtained })),
      certificationDetails: t.certifications.map((c) => ({
        id: c.id,
        type: c.type.name,
        issuer: c.issuer,
        number: c.number,
        issuedAt: fromDbDate(c.issuedAt),
        expiresAt: fromDbDate(c.expiresAt),
      })),
      experiences: t.experiences.map((e) => ({
        id: e.id,
        kind: e.kind,
        schoolName: e.schoolName,
        role: e.role,
        subjects: e.subjects,
        levels: e.levels,
        startDate: fromDbDate(e.startDate),
        endDate: fromDbDate(e.endDate),
        isCurrent: e.isCurrent,
        description: e.description,
      })),
      cv: active ? { fileName: active.fileName, mimeType: active.mimeType, uploadedAt: active.uploadedAt.toISOString() } : null,
    };
  }

  /** GET /teachers/:id/cv: 10-minute link to the active, virus-scanned CV; logged. */
  async cvLink(viewer: AuthUser, teacherId: string, download: boolean): Promise<CvLinkResponse> {
    const t = await this.findable(teacherId);
    const cv = t.cvs[0];
    if (!cv) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'This teacher has no CV yet');
    const key = download ? cv.objectKey : cvViewKey(cv);
    if (!key) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'The CV preview is not ready yet');
    const url = await this.uploads.signedUrl(key, download ? { downloadName: cv.fileName } : { contentType: 'application/pdf' });
    await this.prisma.profileView.create({ data: { teacherId: t.id, viewerId: viewer.id, kind: download ? 'cv_download' : 'cv_view' } });
    const ttl = this.config.getOrThrow<number>('SIGNED_URL_TTL_SECONDS');
    return { url, fileName: cv.fileName, mimeType: cv.mimeType, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
  }

  private async findable(teacherId: string) {
    const t = await this.prisma.teacherProfile.findFirst({
      where: { id: teacherId, isPublished: true, visibility: 'visible', deletedAt: null, user: { status: 'active', deletedAt: null } },
      include: {
        user: { select: { phone: true, email: true } },
        qualifications: { where: { deletedAt: null }, include: { type: true }, orderBy: { yearObtained: 'desc' } },
        certifications: { where: { deletedAt: null }, include: { type: true } },
        experiences: { where: { deletedAt: null }, orderBy: { startDate: 'desc' } },
        cvs: { where: { isActive: true, scanStatus: 'clean', deletedAt: null }, take: 1 },
      },
    });
    if (!t) throw notFound();
    return t;
  }

  /** The safe card fields for a set of teachers (no address, no coordinates). */
  private async listItems(ids: string[]): Promise<Map<string, Omit<TeacherListItem, 'matchScore' | 'distanceKm'>>> {
    const rows = await this.prisma.teacherProfile.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        fullName: true,
        photoKey: true,
        subjects: true,
        levels: true,
        jobTypes: true,
        yearsExperience: true,
        noExperienceYet: true,
        willingToRelocate: true,
        availableFrom: true,
        expectedSalaryMin: true,
        expectedSalaryMax: true,
        completenessScore: true,
        updatedAt: true,
        state: { select: { id: true, name: true, slug: true } },
        lga: { select: { id: true, name: true, slug: true } },
        qualifications: { where: { deletedAt: null }, select: { type: { select: { name: true, rank: true } } } },
        certifications: { where: { deletedAt: null }, select: { type: { select: { name: true } } } },
      },
    });
    const out = new Map<string, Omit<TeacherListItem, 'matchScore' | 'distanceKm'>>();
    for (const r of rows) {
      const best = [...r.qualifications].sort((a, b) => b.type.rank - a.type.rank)[0];
      out.set(r.id, {
        id: r.id,
        fullName: r.fullName ?? 'Teacher',
        photoUrl: r.photoKey ? await this.uploads.signedUrl(r.photoKey) : null,
        state: r.state,
        lga: r.lga,
        subjects: r.subjects,
        levels: r.levels,
        jobTypes: r.jobTypes,
        yearsExperience: r.yearsExperience,
        noExperienceYet: r.noExperienceYet,
        highestQualification: best?.type.name ?? null,
        certifications: r.certifications.map((c) => c.type.name),
        willingToRelocate: r.willingToRelocate,
        availableFrom: fromDbDate(r.availableFrom),
        expectedSalaryMin: r.expectedSalaryMin,
        expectedSalaryMax: r.expectedSalaryMax,
        completenessScore: r.completenessScore,
        updatedAt: r.updatedAt.toISOString(),
      });
    }
    return out;
  }

  private async qualRank(slug: string): Promise<number | null> {
    const q = await this.prisma.qualificationType.findUnique({ where: { slug }, select: { rank: true } });
    if (!q) {
      throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Validation failed', {
        issues: [{ path: 'qualification', message: `Unknown qualification: ${slug}` }],
      });
    }
    return q.rank;
  }
}
