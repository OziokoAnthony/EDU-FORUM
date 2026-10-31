/**
 * Private object storage (Backblaze B2 via its S3 API). Nothing in the bucket is public:
 * browsers upload and download only through signed URLs that expire (10 minutes).
 */
export interface ObjectStorage {
  /** Signed PUT URL; the browser must send exactly this Content-Type and Content-Length. */
  signPut(key: string, contentType: string, contentLength: number): Promise<string>;
  /** Signed GET URL. `downloadName` makes the browser save the file instead of showing it. */
  signGet(key: string, options?: { downloadName?: string; contentType?: string }): Promise<string>;
  head(key: string): Promise<{ size: number; contentType: string | null } | null>;
  /** Bytes [start, end] inclusive, for file-signature checks without downloading everything. */
  getRange(key: string, start: number, end: number): Promise<Buffer>;
  get(key: string): Promise<Buffer>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  copy(fromKey: string, toKey: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/** Tests: files live in a Map; signed URLs are fake but carry the key. */
export class MemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async signPut(key: string): Promise<string> {
    return `memory://put/${key}`;
  }

  async signGet(key: string, options: { downloadName?: string } = {}): Promise<string> {
    return `memory://get/${key}${options.downloadName ? `?download=${encodeURIComponent(options.downloadName)}` : ''}`;
  }

  async head(key: string) {
    const o = this.objects.get(key);
    return o ? { size: o.body.length, contentType: o.contentType } : null;
  }

  async getRange(key: string, start: number, end: number): Promise<Buffer> {
    return (await this.get(key)).subarray(start, end + 1);
  }

  async get(key: string): Promise<Buffer> {
    const o = this.objects.get(key);
    if (!o) throw new Error(`No object ${key}`);
    return o.body;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    this.objects.set(toKey, { ...this.objects.get(fromKey)! });
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
