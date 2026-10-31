import { HttpStatus, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ALERT_MAX_ITEMS,
  APP_NAME,
  filtersToQuery,
  MAX_SAVED_SEARCHES,
  teacherSearchSchema,
  vacancySearchSchema,
  type AlertFrequency,
  type Paginated,
  type SavedEntry,
  type savedQuerySchema,
  type SavedSearchItem,
  type savedSearchSchema,
  type saveItemSchema,
  type updateSavedSearchSchema,
} from '@edu-forum/shared';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { ApiException } from '../../common/filters/api-exception.filter';
import type { Prisma, SavedSearch, User } from '../../generated/prisma/client';
import { simpleEmail } from '../../infra/mail/simple-email';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { JOB_QUEUE, type JobQueue } from '../../infra/queue/job-queue';
import { NotificationsService } from '../notifications/notifications.service';
import { TeacherSearchService } from '../search/teacher-search.service';
import { toVacancyListItem, VacancySearchService } from '../search/vacancy-search.service';

/** Jobs and their crons (UTC; Nigeria is UTC+1, so 06:00 UTC = 7am WAT). */
export const ALERT_JOBS: Record<Exclude<AlertFrequency, 'off'>, { name: string; cron: string }> = {
  instant: { name: 'saved-search-alerts-instant', cron: '*/15 * * * *' },
  daily: { name: 'saved-search-alerts-daily', cron: '0 6 * * *' },
  weekly: { name: 'saved-search-alerts-weekly', cron: '0 6 * * 1' },
};
/** Filters that are about paging or ordering, not about what matches. */
const NOT_FILTERS = ['page', 'limit', 'sort'];
const notFound = (what: string) => new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`);
const rule = (message: string) => new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', message);
const LIST_INCLUDE = { state: { select: { id: true, name: true, slug: true } }, lga: { select: { id: true, name: true, slug: true } } } as const;

/**
 * Saved items (teachers save jobs, principals/directors save teachers) and saved searches
 * with alerts (confirmed 2026-10-31): instant, daily or weekly, up to 10 searches each; one
 * alert lists up to 10 new matches.
 */
@Injectable()
export class SavedService implements OnModuleInit {
  private readonly logger = new Logger(SavedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vacancies: VacancySearchService,
    private readonly teachers: TeacherSearchService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const [frequency, job] of Object.entries(ALERT_JOBS)) {
      this.queue.register(job.name, () => this.sendAlerts(frequency as AlertFrequency).then(() => undefined));
      await this.queue.schedule(job.name, job.cron);
    }
  }

  // ───────────── saved items ─────────────

  async save(user: AuthUser, input: z.output<typeof saveItemSchema>): Promise<SavedEntry> {
    const wanted = user.role === 'teacher' ? 'vacancy' : 'teacher';
    if (input.itemType !== wanted) throw rule(user.role === 'teacher' ? 'Teachers save jobs' : 'Principals and directors save teachers');
    if (wanted === 'vacancy') {
      const v = await this.prisma.vacancy.findFirst({ where: { id: input.itemId, deletedAt: null, status: { in: ['published', 'closed'] }, takedownReason: null } });
      if (!v) throw notFound('Vacancy');
    } else {
      const t = await this.prisma.teacherProfile.findFirst({ where: { id: input.itemId, deletedAt: null, isPublished: true, visibility: 'visible' } });
      if (!t) throw notFound('Teacher');
    }
    const row = await this.prisma.savedItem.upsert({
      where: { userId_itemType_itemId: { userId: user.id, itemType: input.itemType, itemId: input.itemId } },
      create: { userId: user.id, itemType: input.itemType, itemId: input.itemId },
      update: {},
    });
    return (await this.entries([row]))[0];
  }

  async list(user: AuthUser, q: z.output<typeof savedQuerySchema>): Promise<Paginated<SavedEntry>> {
    const where: Prisma.SavedItemWhereInput = { userId: user.id, itemType: user.role === 'teacher' ? 'vacancy' : 'teacher', itemId: q.itemId };
    const [rows, total] = await Promise.all([
      this.prisma.savedItem.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.savedItem.count({ where }),
    ]);
    return { data: await this.entries(rows), meta: { page: q.page, limit: q.limit, total } };
  }

  async unsave(user: AuthUser, id: string): Promise<void> {
    const { count } = await this.prisma.savedItem.deleteMany({ where: { id, userId: user.id } });
    if (count === 0) throw notFound('Saved item');
  }

  /** Cards for saved rows. Closed jobs stay (marked closed); removed or hidden ones show as unavailable. */
  private async entries(rows: { id: string; itemType: 'vacancy' | 'teacher'; itemId: string; createdAt: Date }[]): Promise<SavedEntry[]> {
    const vacancyIds = rows.filter((r) => r.itemType === 'vacancy').map((r) => r.itemId);
    const teacherIds = rows.filter((r) => r.itemType === 'teacher').map((r) => r.itemId);
    const [vacancies, teacherRows, teacherCards] = await Promise.all([
      this.prisma.vacancy.findMany({ where: { id: { in: vacancyIds } }, include: LIST_INCLUDE }),
      this.prisma.teacherProfile.findMany({ where: { id: { in: teacherIds } }, select: { id: true, isPublished: true, visibility: true, deletedAt: true } }),
      this.teachers.listItems(teacherIds),
    ]);
    const vById = new Map(vacancies.map((v) => [v.id, v]));
    const tById = new Map(teacherRows.map((t) => [t.id, t]));
    return rows.map((r): SavedEntry => {
      const savedAt = r.createdAt.toISOString();
      if (r.itemType === 'vacancy') {
        const v = vById.get(r.itemId);
        const visible = v && !v.deletedAt && !v.takedownReason && (v.status === 'published' || v.status === 'closed');
        return { id: r.id, itemType: 'vacancy', itemId: r.itemId, savedAt, vacancy: visible ? { ...toVacancyListItem(v, null, null), closed: v.status === 'closed' } : null };
      }
      const t = tById.get(r.itemId);
      const card = teacherCards.get(r.itemId);
      const available = !!t && t.isPublished && t.visibility === 'visible' && !t.deletedAt;
      return { id: r.id, itemType: 'teacher', itemId: r.itemId, savedAt, teacher: card && !t?.deletedAt ? { ...card, available } : null };
    });
  }

  // ───────────── saved searches ─────────────

  async searches(user: AuthUser): Promise<SavedSearchItem[]> {
    const rows = await this.prisma.savedSearch.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { createdAt: 'desc' } });
    return rows.map(toSearchItem);
  }

  async createSearch(user: AuthUser, input: z.output<typeof savedSearchSchema>): Promise<SavedSearchItem> {
    const count = await this.prisma.savedSearch.count({ where: { userId: user.id, deletedAt: null } });
    if (count >= MAX_SAVED_SEARCHES) throw rule(`You can save up to ${MAX_SAVED_SEARCHES} searches. Delete one first.`);
    const scope = user.role === 'teacher' ? 'vacancies' : 'teachers';
    const row = await this.prisma.savedSearch.create({
      data: { userId: user.id, scope, name: input.name, filters: this.checkFilters(scope, input.filters), alertFrequency: input.alertFrequency },
    });
    return toSearchItem(row);
  }

  async updateSearch(user: AuthUser, id: string, input: z.output<typeof updateSavedSearchSchema>): Promise<SavedSearchItem> {
    const row = await this.prisma.savedSearch.findFirst({ where: { id, userId: user.id, deletedAt: null } });
    if (!row) throw notFound('Saved search');
    const updated = await this.prisma.savedSearch.update({
      where: { id },
      data: {
        name: input.name,
        filters: input.filters ? this.checkFilters(row.scope, input.filters) : undefined,
        alertFrequency: input.alertFrequency,
        // Turning alerts back on starts from now, not with a backlog.
        lastAlertedAt: input.alertFrequency && input.alertFrequency !== 'off' && row.alertFrequency === 'off' ? new Date() : undefined,
      },
    });
    return toSearchItem(updated);
  }

  async deleteSearch(user: AuthUser, id: string): Promise<void> {
    const { count } = await this.prisma.savedSearch.updateMany({ where: { id, userId: user.id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count === 0) throw notFound('Saved search');
  }

  /** Filters must be a valid search for the scope; paging and sorting are dropped. */
  private checkFilters(scope: 'vacancies' | 'teachers', filters: Record<string, string | string[]>): Prisma.InputJsonValue {
    const clean = Object.fromEntries(Object.entries(filters).filter(([k, v]) => !NOT_FILTERS.includes(k) && (Array.isArray(v) ? v.length : v !== '')));
    const schema = scope === 'vacancies' ? vacancySearchSchema : teacherSearchSchema;
    const parsed = schema.safeParse(clean);
    if (!parsed.success) {
      throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Invalid input', {
        issues: parsed.error.issues.map((i) => ({ path: ['filters', ...i.path].join('.'), message: i.message })),
      });
    }
    // Keep the raw (URL-style) values, minus anything the search does not know.
    const known = Object.keys(schema.shape);
    return Object.fromEntries(Object.entries(clean).filter(([k]) => known.includes(k)));
  }

  // ───────────── alerts ─────────────

  /** Runs the saved searches due at this frequency; each gets at most one alert with new matches. */
  async sendAlerts(frequency: AlertFrequency, now = new Date()): Promise<number> {
    const due = await this.prisma.savedSearch.findMany({
      where: { alertFrequency: frequency, deletedAt: null, user: { status: 'active', deletedAt: null } },
      include: { user: true },
    });
    let sent = 0;
    for (const s of due) {
      try {
        if (await this.alertOne(s, now)) sent++;
      } catch (err) {
        this.logger.error(`Alert for saved search ${s.id} failed: ${(err as Error).message}`);
      }
    }
    return sent;
  }

  private async alertOne(s: SavedSearch & { user: User }, now: Date): Promise<boolean> {
    const since = s.lastAlertedAt ?? s.createdAt;
    const filters = s.filters as Record<string, string | string[]>;
    const appUrl = this.config.getOrThrow<string>('APP_URL');
    let lines: string[];
    let total: number;
    let link: string;
    if (s.scope === 'vacancies') {
      const q = vacancySearchSchema.parse({ ...filters, sort: 'newest', limit: ALERT_MAX_ITEMS });
      const res = await this.vacancies.search({ id: s.userId, role: 'teacher' } as AuthUser, q, { since });
      total = res.meta.total;
      lines = res.data.map((v) => `${v.title} — ${v.schoolLabel}, ${v.lga.name}, ${v.state.name}`);
      link = `/teacher/jobs?${filtersToQuery(filters)}`;
    } else {
      const q = teacherSearchSchema.parse({ ...filters, sort: 'updated', limit: ALERT_MAX_ITEMS });
      const res = await this.teachers.search(q, { since });
      total = res.meta.total;
      lines = res.data.map((t) => `${t.fullName}${t.lga ? ` — ${t.lga.name}, ${t.state?.name ?? ''}` : ''}${t.highestQualification ? ` · ${t.highestQualification}` : ''}`);
      link = `/hiring/teachers?${filtersToQuery(filters)}`;
    }
    await this.prisma.savedSearch.update({ where: { id: s.id }, data: { lastAlertedAt: now } });
    if (total === 0) return false;

    const noun = s.scope === 'vacancies' ? (total === 1 ? 'new job' : 'new jobs') : total === 1 ? 'new teacher' : 'new teachers';
    const title = `${total} ${noun} for “${s.name}”`;
    const more = total > lines.length ? [`…and ${total - lines.length} more.`] : [];
    await this.notifications.notify({
      userId: s.userId,
      type: 'saved_search_match',
      title,
      body: lines.slice(0, 3).join(' · ') + (total > 3 ? ' …' : ''),
      link,
      email: s.user.email
        ? simpleEmail(s.user.email, `${title} on ${APP_NAME}`, [...lines, ...more], { url: `${appUrl}${link}`, text: 'See all matches' })
        : undefined,
    });
    return true;
  }
}

function toSearchItem(s: SavedSearch): SavedSearchItem {
  return {
    id: s.id,
    scope: s.scope,
    name: s.name ?? 'Saved search',
    filters: s.filters as Record<string, string | string[]>,
    alertFrequency: s.alertFrequency,
    lastAlertedAt: s.lastAlertedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}
