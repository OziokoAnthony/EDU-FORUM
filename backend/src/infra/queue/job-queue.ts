import { Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';

export interface JobContext {
  /** True on the last retry: handlers record a permanent failure instead of throwing. */
  finalAttempt: boolean;
}

export type JobHandler = (data: Record<string, unknown>, ctx: JobContext) => Promise<void>;

/** Background jobs: virus scan + DOC→PDF now, emails and alerts in later phases. */
export interface JobQueue {
  /** Handlers register in onModuleInit; workers start after the app has booted. */
  register(name: string, handler: JobHandler): void;
  add(name: string, data: Record<string, unknown>): Promise<void>;
  /** Repeating job, e.g. the nightly purge. */
  schedule(name: string, cron: string): Promise<void>;
}

export const JOB_QUEUE = Symbol('JOB_QUEUE');

const QUEUE_NAME = 'edu-forum';
const ATTEMPTS = 5;

function redisConnection(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null, // required by BullMQ workers
  };
}

/** Redis-backed queue with retries (5 attempts, exponential backoff from 10 s). */
export class BullJobQueue implements JobQueue, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('JobQueue');
  private readonly handlers = new Map<string, JobHandler>();
  private readonly connection: ConnectionOptions;
  private readonly queue: Queue;
  private worker?: Worker;

  constructor(redisUrl: string) {
    this.connection = redisConnection(redisUrl);
    this.queue = new Queue(QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: ATTEMPTS,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }

  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  async add(name: string, data: Record<string, unknown>): Promise<void> {
    await this.queue.add(name, data);
  }

  async schedule(name: string, cron: string): Promise<void> {
    await this.queue.upsertJobScheduler(name, { pattern: cron }, { name, data: {} });
  }

  onApplicationBootstrap(): void {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const handler = this.handlers.get(job.name);
        if (!handler) throw new Error(`No handler for job ${job.name}`);
        const attempts = job.opts.attempts ?? 1;
        await handler(job.data as Record<string, unknown>, { finalAttempt: job.attemptsMade + 1 >= attempts });
      },
      { connection: this.connection, concurrency: 2 },
    );
    this.worker.on('failed', (job, err) => this.logger.warn(`${job?.name} ${job?.id} failed: ${err.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}

/** Tests: runs the job immediately, once, inside the calling request. */
export class InlineJobQueue implements JobQueue {
  private readonly handlers = new Map<string, JobHandler>();
  readonly scheduled: string[] = [];

  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  async add(name: string, data: Record<string, unknown>): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`No handler for job ${name}`);
    await handler(data, { finalAttempt: true });
  }

  async schedule(name: string): Promise<void> {
    this.scheduled.push(name);
  }

  /** Runs a scheduled job by hand (e.g. the purge) in tests. */
  run(name: string): Promise<void> {
    return this.add(name, {});
  }
}
