import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JOB_QUEUE, type JobQueue } from '../../infra/queue/job-queue';

export const SEO_NOTIFY_JOB = 'seo-notify';

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

  constructor(
    private readonly config: ConfigService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  onModuleInit(): void {
    this.queue.register(SEO_NOTIFY_JOB, (data) => this.deliver(data as unknown as SeoChange));
  }

  notify(change: SeoChange): Promise<void> {
    return this.queue.add(SEO_NOTIFY_JOB, { ...change });
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
