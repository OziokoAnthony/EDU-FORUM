import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { JOB_QUEUE, type JobQueue } from '../queue/job-queue';
import { SMS_SENDER, type SmsMessage, type SmsSender } from './sms-sender';

export const SEND_SMS_JOB = 'send-sms';

/** Alert texts go through the job queue, so a slow or failing SMS provider never blocks a request. */
@Injectable()
export class SmsQueue implements OnModuleInit {
  constructor(
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  onModuleInit(): void {
    this.queue.register(SEND_SMS_JOB, (data) => this.sms.send(data as unknown as SmsMessage));
  }

  send(message: SmsMessage): Promise<void> {
    return this.queue.add(SEND_SMS_JOB, { ...message });
  }
}
