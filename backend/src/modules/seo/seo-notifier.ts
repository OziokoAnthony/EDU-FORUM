import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JOB_QUEUE, type JobQueue } from '../../infra/queue/job-queue';

export const SEO_NOTIFY_JOB = 'seo-notify';
/** Blog pages: refresh the web app's cache only (Google's Indexing API is for job pages). */
export const SEO_REVALIDATE_JOB = 'seo-revalidate';

export interface SeoChange {
  path: string;
  shortId: string;
  /** URL_UPDATED for publish/edit, URL_DELETED for close/takedown/expiry (Google Indexing API). */
  type: 'URL_UPDATED' | 'URL_DELETED';
}

/**
 * After a job is published, edited or closed: tells the web app to refresh its cached pages
 * (on-demand revalidation) and notifies Google's Indexing API. Runs as a background job so
 * a slow web app or Google never blocks the request. The Indexing API adapter is a logger
 * until production credentials exist (INDEXING_DRIVER=log); tests use "memory".
 */
@Injectable()
export class SeoNotifier implements OnModuleInit {
  private readonly logger = new Logger('SeoNotifier');
  /** INDEXING_DRIVER=memory: what would have been sent (tests). */
  readonly sent: SeoChange[] = [];
  /** INDEXING_DRIVER=memory: cache tags that would have been refreshed (tests). */
  readonly revalidated: string[][] = [];

  constructor(
    private readonly config: ConfigService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  onModuleInit(): void {
    this.queue.register(SEO_NOTIFY_JOB, (data) => this.deliver(data as unknown as SeoChange));
    this.queue.register(SEO_REVALIDATE_JOB, (data) => this.refresh((data as { tags: string[] }).tags));
  }

  notify(change: SeoChange): Promise<void> {
    return this.queue.add(SEO_NOTIFY_JOB, { ...change });
  }

  /** Refresh cached public pages by tag, e.g. ['blog', 'blog:my-post']. */
  revalidate(tags: string[]): Promise<void> {
    return this.queue.add(SEO_REVALIDATE_JOB, { tags });
  }

  private async refresh(tags: string[]): Promise<void> {
    if (this.config.get('INDEXING_DRIVER') === 'memory') {
      this.revalidated.push(tags);
      return;
    }
    const secret = this.config.get<string>('REVALIDATE_SECRET');
    if (!secret) return;
    const res = await fetch(`${this.config.getOrThrow<string>('APP_URL')}/api/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': secret },
      body: JSON.stringify({ tags: [...tags, 'seo'] }),
    });
    if (!res.ok) throw new Error(`Revalidate failed: ${res.status}`);
  }

  private async deliver(change: SeoChange): Promise<void> {
    if (this.config.get('INDEXING_DRIVER') === 'memory') {
      this.sent.push(change);
      return;
    }
    const secret = this.config.get<string>('REVALIDATE_SECRET');
    if (secret) {
      const res = await fetch(`${this.config.getOrThrow<string>('APP_URL')}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': secret },
        body: JSON.stringify({ tags: [`vacancy:${change.shortId}`, 'vacancies', 'seo'] }),
      });
      // Throwing lets BullMQ retry while the web app restarts.
      if (!res.ok) throw new Error(`Revalidate failed: ${res.status}`);
    }
    const url = `${this.config.getOrThrow<string>('APP_URL')}${change.path}`;
    this.logger.log(`Indexing API (stub): ${change.type} ${url}`);
  }
}
