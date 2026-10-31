import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { JOB_QUEUE, type JobQueue } from '../queue/job-queue';
import { MAILER, type Mailer, type MailMessage } from './mailer';

export const SEND_EMAIL_JOB = 'send-email';

/**
 * Notification emails go through the job queue (CLAUDE.md: BullMQ + Redis), so a slow or
 * failing mail server never blocks a request; BullMQ retries. Tests run them inline.
 */
@Injectable()
export class EmailQueue implements OnModuleInit {
  constructor(
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  onModuleInit(): void {
    this.queue.register(SEND_EMAIL_JOB, (data) => this.mailer.send(data as unknown as MailMessage));
  }

  send(message: MailMessage): Promise<void> {
    return this.queue.add(SEND_EMAIL_JOB, { ...message });
  }
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
