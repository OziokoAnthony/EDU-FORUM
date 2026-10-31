import { Logger } from '@nestjs/common';

export interface SmsMessage {
  to: string;
  text: string;
}

/** Outgoing SMS. Console locally; a Termii adapter is added in Phase 12. */
export interface SmsSender {
  send(message: SmsMessage): Promise<void>;
}

export const SMS_SENDER = Symbol('SMS_SENDER');

/** Development: prints the SMS (including OTP codes) to the API log. */
export class ConsoleSmsSender implements SmsSender {
  private readonly logger = new Logger('SMS');

  async send({ to, text }: SmsMessage): Promise<void> {
    this.logger.log(`to ${to}: ${text}`);
  }
}

export class MemorySmsSender implements SmsSender {
  readonly sent: SmsMessage[] = [];

  async send(message: SmsMessage): Promise<void> {
    this.sent.push(message);
  }

  lastTo(to: string): SmsMessage | undefined {
    return [...this.sent].reverse().find((m) => m.to === to);
  }
}
