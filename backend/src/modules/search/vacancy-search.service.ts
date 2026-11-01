import { Injectable } from '@nestjs/common';
import { CONFIDENTIAL_SCHOOL, type Paginated, type VacancyListItem, type vacancySearchSchema } from '@edu-forum/shared';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { fromDbDate } from '../../common/dates';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { point, vacancyMatchScore } from './match-sql';
import { availableUserSql } from '../../common/available-user';

type Query = z.output<typeof vacancySearchSchema>;
type Origin = { lat: number; lng: number } | null;
interface TeacherFacts {
  subjects: string[];
  levels: string[];
  maxQualRank: number | null;
  years: number;
  certifications: string[];
  origin: Origin;
}

const RECOMMENDED_LIMIT = 20;

function excerpt(html: string): string {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  return text.length > 200 ? `${text.slice(0, 197).trimEnd()}…` : text;
}

type ListRow = Prisma.VacancyGetPayload<{ include: { state: { select: { id: true; name: true; slug: true } }; lga: { select: { id: true; name: true; slug: true } } } }>;

/** The public card for a vacancy (search results, saved jobs). */
export function toVacancyListItem(v: ListRow, km: number | null, score: number | null): VacancyListItem {
  const anonymous = v.locationVisibility === 'anonymous';
  return {
    id: v.id,
    slug: v.slug,
    shortId: v.shortId,
    title: v.title,
    schoolLabel: anonymous || !v.schoolName ? CONFIDENTIAL_SCHOOL : v.schoolName,
    isAnonymous: anonymous,
    schoolType: v.schoolType,
    state: v.state,
    lga: v.lga,
    subjects: v.subjects,
    levels: v.levels,
    jobType: v.jobType,
    salaryMin: v.salaryMin,
    salaryMax: v.salaryMax,
    salaryPeriod: v.salaryPeriod,
    excerpt: excerpt(v.description),
    publishedAt: (v.publishedAt ?? v.createdAt).toISOString(),
    deadline: fromDbDate(v.deadline),
    // Exact distances to a hidden school could pinpoint it, so anonymous ones show none.
    distanceKm: anonymous || km == null ? null : Math.round(km),
    matchScore: score,
  };
}

/**
 * GET /vacancies and /vacancies/recommended. Live vacancies only. Origin = lat/lng given,
 * else the teacher's saved pin; without one, state/LGA filters do the work (CLAUDE.md).
 */
@Injectable()
export class VacancySearchService {
  constructor(private readonly prisma: PrismaService) {}

  /** `since` (saved-search alerts only): vacancies published after that moment. */
  async search(viewer: AuthUser | undefined, q: Query, opts: { since?: Date } = {}): Promise<Paginated<VacancyListItem>> {
    const teacher = viewer?.role === 'teacher' ? await this.teacherFacts(viewer.id) : null;
    const origin: Origin = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : (teacher?.origin ?? null);
    const extra = opts.since ? Prisma.sql`v.published_at > ${opts.since}` : undefined;
    return this.run({ q, teacher, origin, page: q.page, limit: q.limit, extra });
  }

  /** Vacancies that match the teacher's profile best (at least one subject or level in common). */
  async recommended(viewer: AuthUser): Promise<Paginated<VacancyListItem>> {
    const teacher = await this.teacherFacts(viewer.id);
    const q = { sort: 'relevance', page: 1, limit: RECOMMENDED_LIMIT } as Query;
    if (!teacher || (teacher.subjects.length === 0 && teacher.levels.length === 0)) {
      return { data: [], meta: { page: 1, limit: RECOMMENDED_LIMIT, total: 0 } };
    }
    return this.run({
      q,
      teacher,
      origin: teacher.origin,
      page: 1,
      limit: RECOMMENDED_LIMIT,
      extra: Prisma.sql`(v.subjects && ${teacher.subjects}::text[] OR v.levels && ${teacher.levels}::text[])`,
    });
  }

  private async run(opts: { q: Query; teacher: TeacherFacts | null; origin: Origin; page: number; limit: number; extra?: Prisma.Sql }) {
    const { q, teacher, origin, page, limit } = opts;
    const km = origin ? Prisma.sql`(ST_Distance(v.geog, ${point(origin.lat, origin.lng)}) / 1000)` : null;
    const score = teacher ? vacancyMatchScore(teacher, km) : Prisma.sql`NULL::int`;

    const where: Prisma.Sql[] = [
      Prisma.sql`v.status = 'published' AND v.deleted_at IS NULL AND v.takedown_reason IS NULL`,
      // A suspended poster's vacancies drop out of search straight away.
      Prisma.sql`EXISTS (SELECT 1 FROM users pu WHERE pu.id = v.created_by AND ${availableUserSql('pu')})`,
      Prisma.sql`(v.deadline IS NULL OR v.deadline >= CURRENT_DATE)`,
    ];
    if (q.q) {
      where.push(Prisma.sql`to_tsvector('english', v.title || ' ' || v.description) @@ websearch_to_tsquery('english', ${q.q})`);
    }
    if (q.subjects?.length) where.push(Prisma.sql`v.subjects && ${q.subjects}::text[]`);
    if (q.levels?.length) where.push(Prisma.sql`v.levels && ${q.levels}::text[]`);
    if (q.jobType) where.push(Prisma.sql`v.job_type = ${q.jobType}::"JobType"`);
    if (q.salaryMin != null) where.push(Prisma.sql`v.salary_max >= ${q.salaryMin}`);
    if (q.state) where.push(Prisma.sql`s.slug = ${q.state}`);
    if (q.lga) where.push(Prisma.sql`l.slug = ${q.lga}`);
    if (q.postedWithin) where.push(Prisma.sql`v.published_at >= now() - make_interval(days => ${q.postedWithin}::int)`);
    if (origin && q.radiusKm) {
      where.push(Prisma.sql`ST_DWithin(v.geog, ${point(origin.lat, origin.lng)}, ${q.radiusKm * 1000})`);
    }
    if (opts.extra) where.push(opts.extra);
    const whereSql = Prisma.join(where, ' AND ');

    const order = {
      relevance: teacher ? Prisma.sql`score DESC, v.published_at DESC` : Prisma.sql`v.published_at DESC`,
      distance: km ? Prisma.sql`km ASC NULLS LAST, v.published_at DESC` : Prisma.sql`v.published_at DESC`,
      newest: Prisma.sql`v.published_at DESC`,
      salary: Prisma.sql`v.salary_max DESC, v.published_at DESC`,
    }[q.sort];

    const from = Prisma.sql`FROM vacancies v JOIN states s ON s.id = v.state_id JOIN lgas l ON l.id = v.lga_id`;
    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; score: number | null; km: number | null }[]>`
        SELECT v.id, ${score} AS score, ${km ?? Prisma.sql`NULL::float`} AS km
        ${from} WHERE ${whereSql}
        ORDER BY ${order}
        LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total ${from} WHERE ${whereSql}`,
    ]);

    const vacancies = await this.prisma.vacancy.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      include: { state: { select: { id: true, name: true, slug: true } }, lga: { select: { id: true, name: true, slug: true } } },
    });
    const byId = new Map(vacancies.map((v) => [v.id, v]));
    const data = rows.map((r) => toVacancyListItem(byId.get(r.id)!, r.km, r.score));
    return { data, meta: { page, limit, total } };
  }

  /** The match score of one vacancy for one teacher (stored on the application). */
  async scoreFor(teacherUserId: string, vacancyId: string): Promise<number> {
    const teacher = await this.teacherFacts(teacherUserId);
    if (!teacher) return 0;
    const km = teacher.origin ? Prisma.sql`(ST_Distance(v.geog, ${point(teacher.origin.lat, teacher.origin.lng)}) / 1000)` : null;
    const [row] = await this.prisma.$queryRaw<{ score: number }[]>`
      SELECT ${vacancyMatchScore(teacher, km)} AS score FROM vacancies v WHERE v.id = ${vacancyId}::uuid`;
    return row?.score ?? 0;
  }

  private async teacherFacts(userId: string): Promise<TeacherFacts | null> {
    const t = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      include: {
        qualifications: { where: { deletedAt: null }, include: { type: { select: { rank: true } } } },
        certifications: { where: { deletedAt: null }, include: { type: { select: { slug: true } } } },
      },
    });
    if (!t) return null;
    return {
      subjects: t.subjects,
      levels: t.levels,
      maxQualRank: t.qualifications.length ? Math.max(...t.qualifications.map((q) => q.type.rank)) : null,
      years: t.yearsExperience,
      certifications: t.certifications.map((c) => c.type.slug),
      origin: t.lat != null && t.lng != null ? { lat: t.lat, lng: t.lng } : null,
    };
  }
}
