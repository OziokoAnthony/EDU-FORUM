import { HttpStatus, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  classLabel,
  resourcePaths,
  slugify,
  type calendarEventSchema,
  type CalendarEventItem,
  type calendarQuerySchema,
  type CalendarKind,
  type createMaterialSchema,
  type createTimetableSchema,
  type ExamDetail,
  type ExamItem,
  type ExamTimetableItem,
  type MaterialItem,
  type MaterialKind,
  type materialsQuerySchema,
  type Paginated,
  type Term,
} from '@edu-forum/shared';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { ApiException } from '../../common/filters/api-exception.filter';
import type { Prisma, Upload } from '../../generated/prisma/client';
import { AuditService } from '../../infra/audit/audit.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SeoNotifier } from '../seo/seo-notifier';
import { UploadsService, type ScanOutcome } from '../uploads/uploads.service';

const notFound = (what: string) => new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const FILE_TYPE: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.ms-powerpoint': 'PowerPoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'image/jpeg': 'Image',
  'image/png': 'Image',
};

const MATERIAL_INCLUDE = { upload: { select: { scanStatus: true } } } satisfies Prisma.TeachingMaterialInclude;
type MaterialRow = Prisma.TeachingMaterialGetPayload<{ include: typeof MATERIAL_INCLUDE }>;
const PUBLIC_MATERIAL = { deletedAt: null, upload: { scanStatus: 'clean' } } satisfies Prisma.TeachingMaterialWhereInput;

const TIMETABLE_INCLUDE = { upload: { select: { scanStatus: true } } } satisfies Prisma.ExamTimetableInclude;
type TimetableRow = Prisma.ExamTimetableGetPayload<{ include: typeof TIMETABLE_INCLUDE }>;
const PUBLIC_TIMETABLE = { deletedAt: null, upload: { scanStatus: 'clean' } } satisfies Prisma.ExamTimetableWhereInput;

/**
 * Resources (user, 2026-11-01), uploaded by admins only: teaching materials (public list,
 * members download through a 10-minute link), school calendar dates, and official exam
 * timetables (public). Files are virus-scanned before they appear; infected ones are removed.
 * Public pages are refreshed through the cache tags `resources`, `calendar` and `exams`.
 */
@Injectable()
export class ResourcesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly audit: AuditService,
    private readonly seo: SeoNotifier,
  ) {}

  onModuleInit(): void {
    this.uploads.onScanned('teaching_material', (u, o) => this.scanned('material', u, o));
    this.uploads.onScanned('exam_timetable', (u, o) => this.scanned('timetable', u, o));
  }

  // ───────────── teaching materials ─────────────

  async materials(q: z.output<typeof materialsQuerySchema>): Promise<Paginated<MaterialItem>> {
    const where: Prisma.TeachingMaterialWhereInput = {
      ...PUBLIC_MATERIAL,
      kind: q.kind,
      subject: q.subject,
      classLevel: q.classLevel,
      term: q.term,
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total, subjects] = await Promise.all([
      this.prisma.teachingMaterial.findMany({ where, include: MATERIAL_INCLUDE, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.teachingMaterial.count({ where }),
      this.subjectNames(),
    ]);
    return { data: rows.map((r) => this.materialItem(r, subjects)), meta: { page: q.page, limit: q.limit, total } };
  }

  async materialBySlug(slug: string): Promise<MaterialItem & { related: MaterialItem[] }> {
    const row = await this.prisma.teachingMaterial.findFirst({ where: { ...PUBLIC_MATERIAL, slug }, include: MATERIAL_INCLUDE });
    if (!row) throw notFound('Material');
    const subjects = await this.subjectNames();
    const related = await this.prisma.teachingMaterial.findMany({
      where: { ...PUBLIC_MATERIAL, id: { not: row.id }, OR: [{ subject: row.subject ?? undefined }, { classLevel: row.classLevel ?? undefined }] },
      include: MATERIAL_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 4,
    });
    return { ...this.materialItem(row, subjects), related: related.map((r) => this.materialItem(r, subjects)) };
  }

  /** Members only: a 10-minute link to the file; every download is counted. */
  async downloadMaterial(id: string): Promise<{ url: string }> {
    const row = await this.prisma.teachingMaterial.findFirst({ where: { ...PUBLIC_MATERIAL, id } });
    if (!row) throw notFound('Material');
    await this.prisma.teachingMaterial.update({ where: { id }, data: { downloads: { increment: 1 } } });
    return { url: await this.uploads.signedUrl(row.objectKey, { downloadName: row.fileName }) };
  }

  async adminMaterials(): Promise<(MaterialItem & { status: 'scanning' | 'ready' })[]> {
    const [rows, subjects] = await Promise.all([
      this.prisma.teachingMaterial.findMany({ where: { deletedAt: null }, include: MATERIAL_INCLUDE, orderBy: { createdAt: 'desc' }, take: 200 }),
      this.subjectNames(),
    ]);
    return rows.map((r) => ({ ...this.materialItem(r, subjects), status: r.upload.scanStatus === 'clean' ? 'ready' : 'scanning' }));
  }

  async createMaterial(admin: AuthUser, input: z.output<typeof createMaterialSchema>): Promise<MaterialItem> {
    if (input.subject && !(await this.prisma.subject.findFirst({ where: { slug: input.subject, isActive: true } }))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Validation failed', { issues: [{ path: 'subject', message: 'Choose a subject from the list' }] });
    }
    const upload = await this.uploads.claim(admin.id, input.uploadId, 'teaching_material');
    const row = await this.prisma.teachingMaterial.create({
      data: {
        title: input.title,
        slug: await this.uniqueSlug(input.title),
        description: input.description,
        kind: input.kind,
        subject: input.subject ?? null,
        classLevel: input.classLevel ?? null,
        term: input.term ?? null,
        uploadId: upload.id,
        objectKey: upload.objectKey,
        fileName: upload.fileName,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        createdById: admin.id,
      },
      include: MATERIAL_INCLUDE,
    });
    await this.uploads.enqueueScan(upload.id);
    await this.audit.log({ actorId: admin.id, action: 'material.create', targetType: 'teaching_material', targetId: row.id, metadata: { title: row.title } });
    await this.seo.revalidate(['resources']);
    return this.materialItem(row, await this.subjectNames());
  }

  async deleteMaterial(admin: AuthUser, id: string): Promise<void> {
    const row = await this.prisma.teachingMaterial.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw notFound('Material');
    await this.prisma.teachingMaterial.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.uploads.deleteObject(row.objectKey).catch(() => undefined);
    await this.audit.log({ actorId: admin.id, action: 'material.delete', targetType: 'teaching_material', targetId: id, metadata: { title: row.title } });
    await this.seo.revalidate(['resources']);
  }

  async sitemap(): Promise<{ data: { path: string; lastmod: string }[] }> {
    const [materials, exams] = await Promise.all([
      this.prisma.teachingMaterial.findMany({ where: PUBLIC_MATERIAL, select: { slug: true, updatedAt: true }, orderBy: { createdAt: 'desc' }, take: 50000 }),
      this.prisma.exam.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true, timetables: { where: PUBLIC_TIMETABLE, select: { updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 1 } } }),
    ]);
    return {
      data: [
        ...materials.map((m) => ({ path: resourcePaths.material(m.slug), lastmod: m.updatedAt.toISOString() })),
        ...exams.map((e) => ({ path: resourcePaths.exam(e.slug), lastmod: (e.timetables[0]?.updatedAt ?? e.updatedAt).toISOString() })),
      ],
    };
  }

  // ───────────── calendar ─────────────

  /** Upcoming dates (from today by default) for all of Nigeria, plus one state's when asked. */
  async calendar(q: z.output<typeof calendarQuerySchema>): Promise<CalendarEventItem[]> {
    const state = q.state ? await this.prisma.state.findFirst({ where: { slug: q.state } }) : null;
    if (q.state && !state) throw notFound('State');
    const from = new Date(`${q.from ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    const rows = await this.prisma.calendarEvent.findMany({
      where: {
        AND: [
          { OR: [{ endDate: { gte: from } }, { endDate: null, startDate: { gte: from } }] },
          ...(q.to ? [{ startDate: { lte: new Date(`${q.to}T00:00:00Z`) } }] : []),
          // A state's page shows the national dates plus that state's own.
          ...(state ? [{ OR: [{ stateId: null }, { stateId: state.id }] }] : []),
        ],
      },
      include: { state: { select: { id: true, slug: true, name: true } } },
      orderBy: [{ startDate: 'asc' }, { title: 'asc' }],
      take: q.limit,
    });
    return rows.map((r) => this.eventItem(r));
  }

  async adminCalendar(): Promise<CalendarEventItem[]> {
    const rows = await this.prisma.calendarEvent.findMany({ include: { state: { select: { id: true, slug: true, name: true } } }, orderBy: { startDate: 'desc' }, take: 500 });
    return rows.map((r) => this.eventItem(r));
  }

  async saveEvent(admin: AuthUser, input: z.output<typeof calendarEventSchema>, id?: string): Promise<CalendarEventItem> {
    if (input.stateId && !(await this.prisma.state.findUnique({ where: { id: input.stateId } }))) throw notFound('State');
    const data = {
      title: input.title,
      kind: input.kind,
      startDate: new Date(`${input.startDate}T00:00:00Z`),
      endDate: input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null,
      stateId: input.stateId ?? null,
      note: input.note ?? null,
    };
    if (id && !(await this.prisma.calendarEvent.findUnique({ where: { id } }))) throw notFound('Date');
    const row = id
      ? await this.prisma.calendarEvent.update({ where: { id }, data, include: { state: { select: { id: true, slug: true, name: true } } } })
      : await this.prisma.calendarEvent.create({ data: { ...data, createdById: admin.id }, include: { state: { select: { id: true, slug: true, name: true } } } });
    await this.audit.log({ actorId: admin.id, action: id ? 'calendar.update' : 'calendar.create', targetType: 'calendar_event', targetId: row.id, metadata: { title: row.title } });
    await this.seo.revalidate(['calendar']);
    return this.eventItem(row);
  }

  async deleteEvent(admin: AuthUser, id: string): Promise<void> {
    const row = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!row) throw notFound('Date');
    await this.prisma.calendarEvent.delete({ where: { id } });
    await this.audit.log({ actorId: admin.id, action: 'calendar.delete', targetType: 'calendar_event', targetId: id, metadata: { title: row.title } });
    await this.seo.revalidate(['calendar']);
  }

  // ───────────── exams ─────────────

  async exams(): Promise<ExamItem[]> {
    const rows = await this.prisma.exam.findMany({
      where: { isActive: true },
      include: { timetables: { where: PUBLIC_TIMETABLE, include: TIMETABLE_INCLUDE, orderBy: [{ year: 'desc' }, { createdAt: 'desc' }], take: 1 } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((e) => ({ ...this.examBase(e), latest: e.timetables[0] ? this.timetableItem(e.timetables[0]) : null }));
  }

  async exam(slug: string): Promise<ExamDetail> {
    const e = await this.prisma.exam.findFirst({
      where: { slug, isActive: true },
      include: { timetables: { where: PUBLIC_TIMETABLE, include: TIMETABLE_INCLUDE, orderBy: [{ year: 'desc' }, { createdAt: 'desc' }] } },
    });
    if (!e) throw notFound('Exam');
    const timetables = e.timetables.map((t) => this.timetableItem(t));
    return { ...this.examBase(e), latest: timetables[0] ?? null, timetables };
  }

  /** Public: official timetables are public documents. */
  async timetableUrl(id: string): Promise<string> {
    const t = await this.prisma.exam.findFirst({ where: { timetables: { some: { id, ...PUBLIC_TIMETABLE } } } });
    const row = t ? await this.prisma.examTimetable.findUnique({ where: { id } }) : null;
    if (!row) throw notFound('Timetable');
    return this.uploads.signedUrl(row.objectKey, { downloadName: row.fileName });
  }

  async adminTimetables(): Promise<(ExamTimetableItem & { exam: { id: string; name: string } })[]> {
    const rows = await this.prisma.examTimetable.findMany({ where: { deletedAt: null }, include: { ...TIMETABLE_INCLUDE, exam: { select: { id: true, name: true } } }, orderBy: [{ year: 'desc' }, { createdAt: 'desc' }], take: 300 });
    return rows.map((r) => ({ ...this.timetableItem(r), exam: r.exam }));
  }

  async createTimetable(admin: AuthUser, input: z.output<typeof createTimetableSchema>): Promise<ExamTimetableItem> {
    const exam = await this.prisma.exam.findUnique({ where: { id: input.examId } });
    if (!exam) throw notFound('Exam');
    const upload = await this.uploads.claim(admin.id, input.uploadId, 'exam_timetable');
    const row = await this.prisma.examTimetable.create({
      data: {
        examId: exam.id,
        year: input.year,
        session: input.session,
        startDate: input.startDate ? new Date(`${input.startDate}T00:00:00Z`) : null,
        endDate: input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null,
        uploadId: upload.id,
        objectKey: upload.objectKey,
        fileName: upload.fileName,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        createdById: admin.id,
      },
      include: TIMETABLE_INCLUDE,
    });
    await this.uploads.enqueueScan(upload.id);
    await this.audit.log({ actorId: admin.id, action: 'timetable.create', targetType: 'exam_timetable', targetId: row.id, metadata: { exam: exam.name, year: input.year, session: input.session } });
    await this.seo.revalidate(['exams']);
    return this.timetableItem(row);
  }

  async deleteTimetable(admin: AuthUser, id: string): Promise<void> {
    const row = await this.prisma.examTimetable.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw notFound('Timetable');
    await this.prisma.examTimetable.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.uploads.deleteObject(row.objectKey).catch(() => undefined);
    await this.audit.log({ actorId: admin.id, action: 'timetable.delete', targetType: 'exam_timetable', targetId: id });
    await this.seo.revalidate(['exams']);
  }

  // ───────────── internals ─────────────

  /** Infected or unreadable files are removed; clean ones go live. */
  private async scanned(kind: 'material' | 'timetable', upload: Upload, outcome: ScanOutcome): Promise<void> {
    if (outcome !== 'clean') {
      if (kind === 'material') await this.prisma.teachingMaterial.updateMany({ where: { uploadId: upload.id }, data: { deletedAt: new Date() } });
      else await this.prisma.examTimetable.updateMany({ where: { uploadId: upload.id }, data: { deletedAt: new Date() } });
      await this.uploads.deleteObject(upload.objectKey).catch(() => undefined);
    }
    await this.seo.revalidate([kind === 'material' ? 'resources' : 'exams']);
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugify(title).slice(0, 80).replace(/-+$/, '') || 'material';
    let slug = base;
    for (let n = 2; await this.prisma.teachingMaterial.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${base}-${n}`;
    return slug;
  }

  private async subjectNames(): Promise<Map<string, string>> {
    return new Map((await this.prisma.subject.findMany({ select: { slug: true, name: true } })).map((s) => [s.slug, s.name]));
  }

  private materialItem(r: MaterialRow, subjects: Map<string, string>): MaterialItem {
    return {
      id: r.id,
      slug: r.slug,
      path: resourcePaths.material(r.slug),
      title: r.title,
      description: r.description,
      kind: r.kind as MaterialKind,
      subject: r.subject ? { slug: r.subject, name: subjects.get(r.subject) ?? r.subject } : null,
      classLevel: r.classLevel ? { slug: r.classLevel, name: classLabel(r.classLevel) } : null,
      term: (r.term as Term | null) ?? null,
      fileType: FILE_TYPE[r.mimeType] ?? 'File',
      sizeBytes: r.sizeBytes,
      downloads: r.downloads,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private eventItem(r: { id: string; title: string; kind: string; startDate: Date; endDate: Date | null; note: string | null; state: { id: string; slug: string; name: string } | null }): CalendarEventItem {
    return { id: r.id, title: r.title, kind: r.kind as CalendarKind, startDate: day(r.startDate)!, endDate: day(r.endDate), state: r.state, note: r.note };
  }

  private examBase(e: { id: string; slug: string; name: string; fullName: string; description: string | null }) {
    return { id: e.id, slug: e.slug, name: e.name, fullName: e.fullName, description: e.description, path: resourcePaths.exam(e.slug) };
  }

  private timetableItem(t: TimetableRow): ExamTimetableItem {
    return {
      id: t.id,
      year: t.year,
      session: t.session,
      startDate: day(t.startDate),
      endDate: day(t.endDate),
      fileType: FILE_TYPE[t.mimeType] ?? 'File',
      sizeBytes: t.sizeBytes,
      ready: t.upload.scanStatus === 'clean',
      createdAt: t.createdAt.toISOString(),
    };
  }
}
