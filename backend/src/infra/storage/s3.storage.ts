import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStorage } from './object-storage';

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  signedUrlTtlSeconds: number;
}

/** Backblaze B2 (or any S3-compatible store). */
export class S3Storage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // The bucket name has capitals, which only path-style URLs allow.
      forcePathStyle: true,
      // B2 does not accept the SDK's default CRC32 checksums on presigned uploads.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  signPut(key: string, contentType: string, contentLength: number): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.config.bucket, Key: key, ContentType: contentType, ContentLength: contentLength });
    // Content-Length is signed, so the browser cannot send a bigger file than it declared.
    return getSignedUrl(this.client, command, {
      expiresIn: this.config.signedUrlTtlSeconds,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
  }

  signGet(key: string, options: { downloadName?: string; contentType?: string } = {}): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ResponseContentType: options.contentType,
      ResponseContentDisposition: options.downloadName
        ? `attachment; filename*=UTF-8''${encodeURIComponent(options.downloadName)}`
        : undefined,
    });
    return getSignedUrl(this.client, command, { expiresIn: this.config.signedUrlTtlSeconds });
  }

  async head(key: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
    } catch (err) {
      if (err instanceof NotFound || (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  async getRange(key: string, start: number, end: number): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key, Range: `bytes=${start}-${end}` }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({ Bucket: this.config.bucket, Key: toKey, CopySource: `${this.config.bucket}/${encodeURI(fromKey)}` }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}
