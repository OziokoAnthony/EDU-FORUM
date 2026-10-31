import { HttpStatus, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { CV_MIME_TYPES, type CvResponse, type MyCvResponse } from '@edu-forum/shared';
import { ApiException } from '../../common/filters/api-exception.filter';
import type { Upload } from '../../generated/prisma/client';
import { DOCUMENT_CONVERTER, type DocumentConverter } from '../../infra/converter/document-converter';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { JOB_QUEUE, type JobQueue } from '../../infra/queue/job-queue';
import { CompletenessService } from '../teachers/completeness.service';
import { TeacherProfilesService } from '../teachers/teacher-profiles.service';
import { UploadsService, type ScanOutcome } from '../uploads/uploads.service';

/** Replaced CVs are kept this long, then deleted (CLAUDE.md pillar 2). */
export const CV_HISTORY_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Rejected uploads stay listed under "pending" for a day so the teacher sees why. */
const REJECTED_VISIBLE_MS = DAY_MS;
export const PURGE_CVS_JOB = 'purge-old-cvs';

/**
 * One active CV per teacher. A new upload becomes active only once its virus scan is clean
 * (and DOC/DOCX has been converted to PDF for the viewer); the previous one is kept 90 days.
 */
@Injectable()
export class CvService implements OnModuleInit {
  private readonly logger = new Logger(CvService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: TeacherProfilesService,
    private readonly completeness: CompletenessService,
    private readonly uploads: UploadsService,
    @Inject(DOCUMENT_CONVERTER) private readonly converter: DocumentConverter,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  async onModuleInit(): Promise<void> {
    this.uploads.onScanned('cv', (upload, outcome) => this.scanned(upload, outcome));
    this.queue.register(PURGE_CVS_JOB, () => this.purgeOld().then(() => undefined));
    await this.queue.schedule(PURGE_CVS_JOB, '30 3 * * *');
  }

  /** POST /teachers/me/cv: upload or replace. */
  async upload(userId: string, uploadId: string): Promise<CvResponse> {
    const upload = await this.uploads.claim(userId, uploadId, 'cv');
    const profile = await this.profiles.ensure(userId);
    const cv = await this.prisma.cv.create({
      data: {
        teacherId: profile.id,
        objectKey: upload.objectKey,
        fileName: upload.fileName,
        mimeType: CV_MIME_TYPES[upload.mimeType as keyof typeof CV_MIME_TYPES],
        sizeBytes: upload.sizeBytes,
      },
    });
    await this.profiles.markStep(profile, 'cv');
    await this.uploads.enqueueScan(upload.id);
    return this.profiles.cvResponse(await this.prisma.cv.findUniqueOrThrow({ where: { id: cv.id } }));
  }

  async getMine(userId: string): Promise<MyCvResponse> {
    const profile = await this.profiles.ensure(userId);
    const [active, pending] = await Promise.all([
      this.prisma.cv.findFirst({ where: { teacherId: profile.id, isActive: true, deletedAt: null } }),
      this.prisma.cv.findMany({
        where: {
          teacherId: profile.id,
          deletedAt: null,
          OR: [
            { scanStatus: 'pending' },
            { scanStatus: { in: ['infected', 'failed'] }, uploadedAt: { gt: new Date(Date.now() - REJECTED_VISIBLE_MS) } },
          ],
        },
        orderBy: { uploadedAt: 'desc' },
      }),
    ]);
    return {
      active: active ? await this.profiles.cvResponse(active) : null,
      pending: await Promise.all(pending.map((cv) => this.profiles.cvResponse(cv))),
    };
  }

  /** Previous versions from the last 90 days. */
  async history(userId: string): Promise<CvResponse[]> {
    const profile = await this.profiles.ensure(userId);
    const rows = await this.prisma.cv.findMany({
      where: {
        teacherId: profile.id,
        isActive: false,
        scanStatus: 'clean',
        deletedAt: null,
        replacedAt: { gt: new Date(Date.now() - CV_HISTORY_DAYS * DAY_MS) },
      },
      orderBy: { uploadedAt: 'desc' },
    });
    return Promise.all(rows.map((cv) => this.profiles.cvResponse(cv)));
  }

  async remove(userId: string, cvId: string): Promise<void> {
    const profile = await this.profiles.ensure(userId);
    const cv = await this.prisma.cv.findFirst({ where: { id: cvId, teacherId: profile.id, deletedAt: null } });
    if (!cv) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'CV not found');
    if (cv.isActive) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'BUSINESS_RULE',
        'Your active CV cannot be deleted. Upload a new CV to replace it.',
      );
    }
    await this.deleteFiles(cv);
    await this.prisma.cv.update({ where: { id: cv.id }, data: { deletedAt: new Date() } });
  }

  private async scanned(upload: Upload, outcome: ScanOutcome): Promise<void> {
    const cv = await this.prisma.cv.findFirst({ where: { objectKey: upload.objectKey } });
    if (!cv || cv.deletedAt) return;
    if (outcome !== 'clean') {
      await this.prisma.cv.update({ where: { id: cv.id }, data: { scanStatus: outcome } });
      return;
    }

    let pdfKey: string | null = null;
    if (cv.mimeType !== 'pdf') {
      // Throws if the converter is down: the job is retried, then marked failed.
      const pdf = await this.converter.toPdf(await this.uploads.readObject(cv.objectKey), cv.fileName);
      pdfKey = cv.objectKey.replace(/\.[^.]+$/, '.pdf');
      await this.uploads.writeObject(pdfKey, pdf, 'application/pdf');
    }

    await this.prisma.$transaction(async (tx) => {
      // Two uploads in quick succession: whichever was uploaded last stays active.
      const newer = await tx.cv.findFirst({
        where: { teacherId: cv.teacherId, isActive: true, deletedAt: null, uploadedAt: { gt: cv.uploadedAt } },
      });
      const now = new Date();
      if (newer) {
        await tx.cv.update({ where: { id: cv.id }, data: { scanStatus: 'clean', pdfKey, replacedAt: now } });
        return;
      }
      await tx.cv.updateMany({
        where: { teacherId: cv.teacherId, isActive: true },
        data: { isActive: false, replacedAt: now },
      });
      await tx.cv.update({ where: { id: cv.id }, data: { scanStatus: 'clean', pdfKey, isActive: true, replacedAt: null } });
    });
    await this.completeness.refresh(cv.teacherId);
  }

  /** Nightly: deletes CV versions replaced more than 90 days ago. Application snapshots are separate copies. */
  async purgeOld(now = new Date()): Promise<number> {
    const old = await this.prisma.cv.findMany({
      where: { isActive: false, deletedAt: null, replacedAt: { lt: new Date(now.getTime() - CV_HISTORY_DAYS * DAY_MS) } },
      take: 500,
    });
    for (const cv of old) {
      await this.deleteFiles(cv);
      await this.prisma.cv.update({ where: { id: cv.id }, data: { deletedAt: now } });
    }
    if (old.length) this.logger.log(`Purged ${old.length} CV versions older than ${CV_HISTORY_DAYS} days`);
    return old.length;
  }

  private async deleteFiles(cv: { objectKey: string; pdfKey: string | null }): Promise<void> {
    for (const key of [cv.objectKey, cv.pdfKey]) {
      if (key) await this.uploads.deleteObject(key).catch(() => undefined);
    }
  }
}
