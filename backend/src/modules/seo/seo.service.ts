import { HttpStatus, Injectable } from '@nestjs/common';
import {
  APP_NAME,
  blogPath,
  htmlToText,
  GONE_AFTER_DAYS,
  jobPath,
  LANDING_MIN_LIVE_JOBS,
  SALARY_PERIOD_LABELS,
  STATIC_PAGES,
  vacancySearchSchema,
  type Breadcrumb,
  type JobPageResponse,
  type LandingPageItem,
  type SeoMeta,
  type SitemapEntry,
} from '@edu-forum/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { ApiException } from '../../common/filters/api-exception.filter';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { VacancySearchService } from '../search/vacancy-search.service';
import { toVacancyResponse, VACANCY_INCLUDE } from '../vacancies/vacancy.serializer';
import { AVAILABLE_USER, availableUserSql, isAvailable } from '../../common/available-user';

const DAY_MS = 24 * 60 * 60 * 1000;
const SHORT_ID = /-([a-z2-9]{8})$/;
/** A live vacancy, as SQL over `v` (same rule as public search). */
const LIVE = Prisma.sql`v.status = 'published' AND v.deleted_at IS NULL AND v.takedown_reason IS NULL
  AND (v.deadline IS NULL OR v.deadline >= CURRENT_DATE)
  AND EXISTS (SELECT 1 FROM users pu WHERE pu.id = v.created_by AND ${availableUserSql('pu')})`;

const notFound = () => new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Page not found');
const k = (n: number) => (n >= 1000 ? `₦${Math.round(n / 1000)}k` : `₦${n}`);

/**
 * PRD "SEO" endpoints: page metadata for public paths, landing-page combinations, sitemap
 * data and the public job page. Landing pages with < 3 live jobs are not indexable.
 */
@Injectable()
export class SeoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly search: VacancySearchService,
  ) {}

  /** GET /vacancies/by-slug/:slug — live and recently closed jobs; 410 after 30 days closed. */
  async jobPage(viewer: AuthUser | undefined, slug: string): Promise<JobPageResponse> {
    const shortId = SHORT_ID.exec(slug)?.[1];
    if (!shortId) throw notFound();
    const v = await this.prisma.vacancy.findFirst({
      where: { shortId, deletedAt: null },
      include: { ...VACANCY_INCLUDE, createdBy: { select: { role: true, status: true, deletedAt: true, deletionRequestedAt: true } } },
    });
    if (!v || v.takedownReason || !isAvailable(v.createdBy) || (v.status !== 'published' && v.status !== 'closed')) throw notFound();
    if (v.status === 'closed' && v.closedAt && Date.now() - v.closedAt.getTime() > GONE_AFTER_DAYS * DAY_MS) {
      throw new ApiException(HttpStatus.GONE, 'GONE', 'This position has closed');
    }
    const isOwner = viewer?.id === v.createdById;
    const vacancy = toVacancyResponse(v, isOwner);
    const similar = await this.search.search(
      undefined,
      vacancySearchSchema.parse({ state: v.state.slug, subjects: v.subjects.join(','), sort: 'newest', limit: 6 }),
    );
    return {
      vacancy,
      similar: similar.data.filter((s) => s.id !== v.id).slice(0, 5),
      canonicalPath: jobPath(v),
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Jobs', path: '/jobs' },
        { name: v.state.name, path: `/jobs/${v.state.slug}` },
        { name: v.lga.name, path: `/jobs/${v.state.slug}/${v.lga.slug}` },
        { name: v.title, path: jobPath(v) },
      ],
    };
  }

  /** GET /seo/meta?path= — title, description, canonical, breadcrumbs, indexability. */
  async meta(path: string): Promise<SeoMeta> {
    const clean = `/${path.split('?')[0].replace(/^\/+|\/+$/g, '')}`.toLowerCase();
    const parts = clean.split('/').filter(Boolean);
    const home: Breadcrumb = { name: 'Home', path: '/' };
    const jobs: Breadcrumb = { name: 'Jobs', path: '/jobs' };

    if (parts.length === 0) {
      return this.page('home', '/', `${APP_NAME}: teaching jobs in Nigeria`, 'Find teaching jobs near you in every Nigerian state, or recruit qualified teachers by subject, level and location. Free for teachers, principals and directors.', APP_NAME, [home], await this.count(), true, {});
    }
    if (parts[0] === 'blog') return this.blogMeta(parts);
    if (parts[0] === 'resources' || parts[0] === 'calendar' || parts[0] === 'exams') return this.resourceMeta(parts);
    const fixed = STATIC_PAGES.find((p) => p.path === clean);
    if (fixed) return this.page('page', fixed.path, fixed.title, fixed.description, fixed.name, [home, { name: fixed.name, path: fixed.path }], 0, true, {});
    if (parts[0] !== 'jobs') throw notFound();

    if (parts.length === 1) {
      const n = await this.count();
      return this.page('jobs', '/jobs', 'Teaching jobs in Nigeria', `${n} live teaching jobs across Nigeria: nursery, primary, secondary and tutoring roles. Filter by state, LGA, subject and salary, and apply free.`, 'Teaching jobs in Nigeria', [home, jobs], n, true, {});
    }

    if (parts[1] === 'subject' && parts.length === 3) {
      const subject = await this.prisma.subject.findFirst({ where: { slug: parts[2], isActive: true } });
      if (!subject) throw notFound();
      const n = await this.count(Prisma.sql`${subject.slug} = ANY(v.subjects)`);
      return this.page(
        'subject',
        clean,
        `${subject.name} teacher jobs in Nigeria`,
        `${n} ${subject.name} teacher job${n === 1 ? '' : 's'} in Nigeria. See salaries, schools and locations, and apply free on ${APP_NAME}.`,
        `${subject.name} teacher jobs in Nigeria`,
        [home, jobs, { name: `${subject.name} jobs`, path: clean }],
        n,
        n >= LANDING_MIN_LIVE_JOBS,
        { subject: subject.slug },
      );
    }

    const state = await this.prisma.state.findFirst({ where: { slug: parts[1], isActive: true } });
    if (!state) {
      if (parts.length === 2 && SHORT_ID.test(parts[1])) return this.jobMeta(parts[1]);
      throw notFound();
    }
    const stateCrumb = { name: state.name, path: `/jobs/${state.slug}` };

    if (parts.length === 2) {
      const n = await this.count(Prisma.sql`v.state_id = ${state.id}::uuid`);
      return this.page(
        'state',
        clean,
        `Teaching jobs in ${state.name}`,
        `${n} teaching job${n === 1 ? '' : 's'} in ${state.name} State: find vacancies by LGA, subject and salary, and apply free on ${APP_NAME}.`,
        `Teaching jobs in ${state.name}`,
        [home, jobs, stateCrumb],
        n,
        n >= LANDING_MIN_LIVE_JOBS,
        { state: state.slug },
      );
    }
    if (parts.length !== 3) throw notFound();

    if (parts[2].endsWith('-teacher')) {
      const subject = await this.prisma.subject.findFirst({ where: { slug: parts[2].slice(0, -'-teacher'.length), isActive: true } });
      if (subject) {
        const n = await this.count(Prisma.sql`v.state_id = ${state.id}::uuid AND ${subject.slug} = ANY(v.subjects)`);
        return this.page(
          'state_subject',
          clean,
          `${subject.name} teacher jobs in ${state.name}`,
          `${n} ${subject.name} teacher job${n === 1 ? '' : 's'} in ${state.name}. Compare salaries and locations, and apply free on ${APP_NAME}.`,
          `${subject.name} teacher jobs in ${state.name}`,
          [home, jobs, stateCrumb, { name: `${subject.name} teacher`, path: clean }],
          n,
          n >= LANDING_MIN_LIVE_JOBS,
          { state: state.slug, subject: subject.slug },
        );
      }
    }
    const lga = await this.prisma.lga.findFirst({ where: { stateId: state.id, slug: parts[2], isActive: true } });
    if (!lga) throw notFound();
    const n = await this.count(Prisma.sql`v.lga_id = ${lga.id}::uuid`);
    return this.page(
      'lga',
      clean,
      `Teaching jobs in ${lga.name}, ${state.name}`,
      `${n} teaching job${n === 1 ? '' : 's'} in ${lga.name}, ${state.name}. Nursery, primary and secondary vacancies near you; apply free on ${APP_NAME}.`,
      `Teaching jobs in ${lga.name}, ${state.name}`,
      [home, jobs, stateCrumb, { name: lga.name, path: clean }],
      n,
      n >= LANDING_MIN_LIVE_JOBS,
      { state: state.slug, lga: lga.slug },
    );
  }

  private async jobMeta(slug: string): Promise<SeoMeta> {
    const page = await this.jobPage(undefined, slug);
    const v = page.vacancy;
    const live = v.status === 'published';
    const salary = `${k(v.salaryMin)}–${k(v.salaryMax)} ${SALARY_PERIOD_LABELS[v.salaryPeriod].replace('per ', '/')}`;
    return this.page(
      'job',
      page.canonicalPath,
      live ? `${v.title} job in ${v.location.lga.name}, ${v.location.state.name}: ${salary}` : `Closed: ${v.title} in ${v.location.lga.name}`,
      live
        ? `${v.schoolLabel} is hiring a ${v.title} in ${v.location.lga.name}, ${v.location.state.name}. Salary ${salary}. Apply free on ${APP_NAME}.`
        : `This ${v.title} position in ${v.location.lga.name}, ${v.location.state.name} has closed. See similar teaching jobs on ${APP_NAME}.`,
      v.title,
      page.breadcrumbs,
      live ? 1 : 0,
      live, // closed jobs: noindex (CLAUDE.md)
      {},
    );
  }

  /** Resources (user, 2026-11-01): /resources, /resources/{slug}, /calendar, /exams, /exams/{slug}. */
  private async resourceMeta(parts: string[]): Promise<SeoMeta> {
    const home: Breadcrumb = { name: 'Home', path: '/' };
    const clean = `/${parts.join('/')}`;
    if (clean === '/calendar') {
      return this.page('page', clean, 'Nigerian school calendar: resumption, mid-term and holidays', `School resumption dates, mid-term breaks, end of term and public holidays for schools across Nigeria, by state, on ${APP_NAME}.`, 'School calendar', [home, { name: 'School calendar', path: clean }], 0, true, {});
    }
    if (clean === '/exams') {
      return this.page('page', clean, 'Exam timetables: WAEC, NECO, JAMB, BECE and more', `Download official timetables for WAEC, NECO, NABTEB, JAMB UTME, BECE, Common Entrance and other exams in Nigeria, free on ${APP_NAME}.`, 'Exam timetables', [home, { name: 'Exam timetables', path: clean }], 0, true, {});
    }
    if (parts[0] === 'exams' && parts.length === 2) {
      const e = await this.prisma.exam.findFirst({ where: { slug: parts[1], isActive: true } });
      if (!e) throw notFound();
      return this.page('page', clean, `${e.name} timetable`, `Download the official ${e.fullName} timetable, with exam dates, free on ${APP_NAME}.`, `${e.name} timetable`, [home, { name: 'Exam timetables', path: '/exams' }, { name: e.name, path: clean }], 0, true, {});
    }
    const resources: Breadcrumb = { name: 'Teaching resources', path: '/resources' };
    if (clean === '/resources') {
      const n = await this.prisma.teachingMaterial.count({ where: { deletedAt: null, upload: { scanStatus: 'clean' } } });
      return this.page('page', clean, 'Lesson notes and schemes of work for Nigerian teachers', `${n} free lesson notes, schemes of work, lesson plans and past questions for nursery, primary and secondary teachers in Nigeria.`, 'Teaching resources', [home, resources], n, n > 0, {});
    }
    if (parts[0] === 'resources' && parts.length === 2) {
      const m = await this.prisma.teachingMaterial.findFirst({ where: { slug: parts[1], deletedAt: null, upload: { scanStatus: 'clean' } } });
      if (!m) throw notFound();
      return this.page('page', clean, m.title, m.description, m.title, [home, resources, { name: m.title, path: clean }], 1, true, {});
    }
    throw notFound();
  }

  /** Blog pages: /blog, /blog/category/{slug} (indexed with 3+ posts), /blog/{slug}. */
  private async blogMeta(parts: string[]): Promise<SeoMeta> {
    const home: Breadcrumb = { name: 'Home', path: '/' };
    const blog: Breadcrumb = { name: 'Blog', path: '/blog' };
    const live = { status: 'published', deletedAt: null, removedReason: null, slug: { not: null }, author: AVAILABLE_USER } satisfies Prisma.PostWhereInput;
    if (parts.length === 1) {
      const n = await this.prisma.post.count({ where: live });
      return this.page('blog', '/blog', `Teaching blog: career tips, exam prep and school news`, `Articles by teachers, principals and directors across Nigeria: career tips, WAEC and NECO exam prep, and school news on ${APP_NAME}.`, `${APP_NAME} blog`, [home, blog], n, n > 0, {});
    }
    if (parts.length === 3 && parts[1] === 'category') {
      const c = await this.prisma.blogCategory.findFirst({ where: { slug: parts[2], isActive: true } });
      if (!c) throw notFound();
      const n = await this.prisma.post.count({ where: { ...live, category: c.slug } });
      const path = `/blog/category/${c.slug}`;
      return this.page('blog_category', path, `${c.name}: articles for teachers in Nigeria`, `${n} ${c.name.toLowerCase()} article${n === 1 ? '' : 's'} by teachers, principals and directors on the ${APP_NAME} blog.`, c.name, [home, blog, { name: c.name, path }], n, n >= LANDING_MIN_LIVE_JOBS, { category: c.slug });
    }
    if (parts.length !== 2) throw notFound();
    const post = await this.prisma.post.findFirst({ where: { ...live, slug: parts[1] } });
    if (!post) throw notFound();
    const c = post.category ? await this.prisma.blogCategory.findUnique({ where: { slug: post.category } }) : null;
    const path = blogPath(post.slug!);
    const text = post.excerpt ?? htmlToText(post.body).replace(/\s+/g, ' ');
    const crumbs = [home, blog, ...(c ? [{ name: c.name, path: `/blog/category/${c.slug}` }] : []), { name: post.title, path }];
    return this.page('blog_post', path, post.metaTitle ?? post.title, post.metaDescription ?? text, post.title, crumbs, 1, true, c ? { category: c.slug } : {});
  }

  /** GET /seo/landing-pages — combinations with at least `minJobs` live jobs (sitemap). */
  async landingPages(minJobs = LANDING_MIN_LIVE_JOBS): Promise<{ data: LandingPageItem[] }> {
    type Row = { path: string; label: string; n: number; lastmod: Date };
    const [states, lgas, subjects, stateSubjects] = await Promise.all([
      this.prisma.$queryRaw<Row[]>`
        SELECT '/jobs/' || s.slug AS path, 'Teaching jobs in ' || s.name AS label, count(*)::int AS n, max(v.updated_at) AS lastmod
        FROM vacancies v JOIN states s ON s.id = v.state_id WHERE ${LIVE} GROUP BY s.slug, s.name HAVING count(*) >= ${minJobs}`,
      this.prisma.$queryRaw<Row[]>`
        SELECT '/jobs/' || s.slug || '/' || l.slug AS path, 'Teaching jobs in ' || l.name || ', ' || s.name AS label, count(*)::int AS n, max(v.updated_at) AS lastmod
        FROM vacancies v JOIN states s ON s.id = v.state_id JOIN lgas l ON l.id = v.lga_id WHERE ${LIVE}
        GROUP BY s.slug, l.slug, l.name, s.name HAVING count(*) >= ${minJobs}`,
      this.prisma.$queryRaw<Row[]>`
        SELECT '/jobs/subject/' || sub.slug AS path, sub.name || ' teacher jobs' AS label, count(*)::int AS n, max(v.updated_at) AS lastmod
        FROM vacancies v JOIN subjects sub ON sub.slug = ANY(v.subjects) WHERE ${LIVE} AND sub.is_active
        GROUP BY sub.slug, sub.name HAVING count(*) >= ${minJobs}`,
      this.prisma.$queryRaw<Row[]>`
        SELECT '/jobs/' || s.slug || '/' || sub.slug || '-teacher' AS path, sub.name || ' teacher jobs in ' || s.name AS label, count(*)::int AS n, max(v.updated_at) AS lastmod
        FROM vacancies v JOIN states s ON s.id = v.state_id JOIN subjects sub ON sub.slug = ANY(v.subjects) WHERE ${LIVE} AND sub.is_active
        GROUP BY s.slug, s.name, sub.slug, sub.name HAVING count(*) >= ${minJobs}`,
    ]);
    const map = (rows: Row[], kind: LandingPageItem['kind']) =>
      rows.map((r) => ({ path: r.path, kind, label: r.label, liveJobs: r.n, lastmod: r.lastmod.toISOString() }));
    return {
      data: [...map(states, 'state'), ...map(lgas, 'lga'), ...map(subjects, 'subject'), ...map(stateSubjects, 'state_subject')],
    };
  }

  /** Live job URLs with lastmod, for /sitemaps/vacancies.xml (added to the endpoint list). */
  async sitemapVacancies(): Promise<{ data: SitemapEntry[] }> {
    const rows = await this.prisma.$queryRaw<{ slug: string; short_id: string; updated_at: Date }[]>`
      SELECT v.slug, v.short_id, v.updated_at FROM vacancies v WHERE ${LIVE} ORDER BY v.updated_at DESC LIMIT 50000`;
    return { data: rows.map((r) => ({ path: jobPath({ slug: r.slug, shortId: r.short_id }), lastmod: r.updated_at.toISOString() })) };
  }

  private count(extra?: Prisma.Sql): Promise<number> {
    const where = extra ? Prisma.sql`${LIVE} AND ${extra}` : LIVE;
    return this.prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM vacancies v WHERE ${where}`.then((r) => r[0].n);
  }

  private page(
    kind: SeoMeta['kind'],
    path: string,
    title: string,
    description: string,
    h1: string,
    breadcrumbs: Breadcrumb[],
    liveJobs: number,
    indexable: boolean,
    filters: SeoMeta['filters'],
  ): SeoMeta {
    return { kind, path, title, description: description.slice(0, 160), h1, canonical: path, indexable, breadcrumbs, liveJobs, filters };
  }
}
