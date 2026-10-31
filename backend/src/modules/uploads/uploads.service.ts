import { HttpStatus, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  fileExtension,
  MAX_UPLOAD_BYTES,
  type signUploadSchema,
  type SignablePurpose,
  type SignUploadResponse,
} from '@edu-forum/shared';
import type { z } from 'zod';
import { ApiException } from '../../common/filters/api-exception.filter';
import type { Upload, UploadPurpose } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { JOB_QUEUE, type JobContext, type JobQueue } from '../../infra/queue/job-queue';
import { VIRUS_SCANNER, type VirusScanner } from '../../infra/scanner/virus-scanner';
import { OBJECT_STORAGE, type ObjectStorage } from '../../infra/storage/object-storage';
import { matchesSignature, SIGNATURE_BYTES } from './file-signature';

export type ScanOutcome = 'clean' | 'infected' | 'failed';

/**
 * What a feature does once its file has been scanned (activate the CV, set the photo…).
 * May throw on 'clean' to have the job retried (e.g. the PDF converter is down); on the
 * final attempt the outcome becomes 'failed' and the listener is called again with it.
 */
export type ScanListener = (upload: Upload, outcome: ScanOutcome) => Promise<void>;

export const SCAN_JOB = 'scan-upload';
export const PURGE_UPLOADS_JOB = 'purge-unclaimed-uploads';
/** Signed but never attached to anything (abandoned uploads) are deleted after a day. */
const UNCLAIMED_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Signed-URL uploads: POST /uploads/sign → browser PUTs to B2 → a feature endpoint claims
 * the upload (size + file-signature check) → background ClamAV scan → listener.
 * Nothing is visible to anyone else until the scan is clean.
 */
@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly logger = new Logger(UploadsService.name);
  private readonly listeners = new Map<UploadPurpose, ScanListener>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(VIRUS_SCANNER) private readonly scanner: VirusScanner,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue.register(SCAN_JOB, (data, ctx) => this.scan(String(data.uploadId), ctx));
    this.queue.register(PURGE_UPLOADS_JOB, () => this.purgeUnclaimed().then(() => undefined));
    await this.queue.schedule(PURGE_UPLOADS_JOB, '15 3 * * *');
  }

  onScanned(purpose: UploadPurpose, listener: ScanListener): void {
    this.listeners.set(purpose, listener);
  }

  async sign(userId: string, input: z.output<typeof signUploadSchema>): Promise<SignUploadResponse> {
    const id = randomUUID();
    const objectKey = `${input.purpose}/${userId}/${id}.${fileExtension(input.fileName)}`;
    await this.prisma.upload.create({
      data: {
        id,
        userId,
        purpose: input.purpose,
        objectKey,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      },
    });
    const ttl = this.config.getOrThrow<number>('SIGNED_URL_TTL_SECONDS');
    return {
      uploadId: id,
      url: await this.storage.signPut(objectKey, input.mimeType, input.sizeBytes),
      method: 'PUT',
      headers: { 'Content-Type': input.mimeType },
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  /**
   * Attaches a finished upload to a feature. Checks the stored object's size and file
   * signature, then queues the virus scan. Each upload can be claimed once.
   */
  async claim(userId: string, uploadId: string, purpose: SignablePurpose): Promise<Upload> {
    const upload = await this.prisma.upload.findFirst({ where: { id: uploadId, userId, deletedAt: null } });
    if (!upload) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Upload not found');
    if (upload.purpose !== purpose) {
      throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', 'This file was uploaded for something else');
    }
    if (upload.confirmedAt) throw new ApiException(HttpStatus.CONFLICT, 'CONFLICT', 'This file has already been used');

    const head = await this.storage.head(upload.objectKey);
    if (!head) {
      throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', 'The file has not finished uploading');
    }
    if (head.size > MAX_UPLOAD_BYTES || head.size !== upload.sizeBytes) {
      await this.reject(upload);
      throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'File must be 5 MB or smaller');
    }
    const firstBytes = await this.storage.getRange(upload.objectKey, 0, SIGNATURE_BYTES - 1);
    if (!matchesSignature(upload.mimeType, firstBytes)) {
      await this.reject(upload);
      throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'The file content does not match its type');
    }

    // Conditional update: two parallel claims of the same upload cannot both win.
    const { count } = await this.prisma.upload.updateMany({
      where: { id: upload.id, confirmedAt: null },
      data: { confirmedAt: new Date() },
    });
    if (count === 0) throw new ApiException(HttpStatus.CONFLICT, 'CONFLICT', 'This file has already been used');
    return this.prisma.upload.findUniqueOrThrow({ where: { id: upload.id } });
  }

  /** Queues the scan. Call after the feature has saved its own row for the upload. */
  enqueueScan(uploadId: string): Promise<void> {
    return this.queue.add(SCAN_JOB, { uploadId });
  }

  /** Background job: ClamAV scan, then the feature's listener. */
  async scan(uploadId: string, ctx: JobContext): Promise<void> {
    const upload = await this.prisma.upload.findUnique({ where: { id: uploadId } });
    if (!upload || upload.deletedAt || upload.scanStatus !== 'pending') return;

    let outcome: ScanOutcome;
    try {
      const verdict = await this.scanner.scan(await this.storage.get(upload.objectKey));
      outcome = verdict.clean ? 'clean' : 'infected';
      if (!verdict.clean) this.logger.warn(`Upload ${upload.id} infected: ${verdict.signature}`);
    } catch (err) {
      if (!ctx.finalAttempt) throw err;
      this.logger.error(`Scan of upload ${upload.id} failed: ${(err as Error).message}`);
      outcome = 'failed';
    }
    await this.applyOutcome(upload, outcome, ctx);
  }

  /** Result from the storage provider's scanner (POST /webhooks/storage/scan-result). */
  async applyWebhookResult(uploadId: string, status: 'clean' | 'infected'): Promise<void> {
    const upload = await this.prisma.upload.findUnique({ where: { id: uploadId } });
    if (!upload || upload.deletedAt || upload.scanStatus !== 'pending' || !upload.confirmedAt) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'No upload is waiting for this result');
    }
    await this.applyOutcome(upload, status, { finalAttempt: false });
  }

  private async applyOutcome(upload: Upload, outcome: ScanOutcome, ctx: JobContext): Promise<void> {
    const listener = this.listeners.get(upload.purpose);
    try {
      await listener?.(upload, outcome);
    } catch (err) {
      if (!ctx.finalAttempt || outcome !== 'clean') throw err;
      this.logger.error(`Processing upload ${upload.id} failed: ${(err as Error).message}`);
      outcome = 'failed';
      await listener?.(upload, outcome);
    }
    if (outcome !== 'clean') await this.storage.delete(upload.objectKey).catch(() => undefined);
    await this.prisma.upload.update({ where: { id: upload.id }, data: { scanStatus: outcome, scannedAt: new Date() } });
  }

  /** Rejected at claim time: the object is removed, the row kept for the record. */
  private async reject(upload: Upload): Promise<void> {
    await this.storage.delete(upload.objectKey).catch(() => undefined);
    await this.prisma.upload.update({ where: { id: upload.id }, data: { scanStatus: 'failed', deletedAt: new Date() } });
  }

  async purgeUnclaimed(): Promise<number> {
    const stale = await this.prisma.upload.findMany({
      where: { confirmedAt: null, deletedAt: null, createdAt: { lt: new Date(Date.now() - UNCLAIMED_TTL_MS) } },
      take: 500,
    });
    for (const upload of stale) {
      await this.storage.delete(upload.objectKey).catch(() => undefined);
      await this.prisma.upload.update({ where: { id: upload.id }, data: { deletedAt: new Date() } });
    }
    return stale.length;
  }

  /** Signed GET for a stored object (10 minutes). */
  signedUrl(key: string, options?: { downloadName?: string; contentType?: string }): Promise<string> {
    return this.storage.signGet(key, options);
  }

  deleteObject(key: string): Promise<void> {
    return this.storage.delete(key);
  }

  readObject(key: string): Promise<Buffer> {
    return this.storage.get(key);
  }

  writeObject(key: string, body: Buffer, contentType: string): Promise<void> {
    return this.storage.put(key, body, contentType);
  }
}
