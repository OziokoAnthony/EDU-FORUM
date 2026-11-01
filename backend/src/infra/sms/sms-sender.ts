import { Logger } from '@nestjs/common';

export interface SmsMessage {
  to: string;
  text: string;
  /** WhatsApp needs a Termii-approved WhatsApp sender; default SMS. */
  channel?: 'sms' | 'whatsapp';
}

/** Outgoing SMS / WhatsApp. Console locally, Termii in production (SMS_DRIVER). */
export interface SmsSender {
  send(message: SmsMessage): Promise<void>;
}

export const SMS_SENDER = Symbol('SMS_SENDER');

/** Development: prints the SMS (including OTP codes) to the API log. */
export class ConsoleSmsSender implements SmsSender {
  private readonly logger = new Logger('SMS');

  async send({ to, text, channel = 'sms' }: SmsMessage): Promise<void> {
    this.logger.log(`${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} to ${to}: ${text}`);
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

/**
 * Termii (https://developers.termii.com): POST /api/sms/send. Nigerian numbers go without the "+".
 * SMS uses the "dnd" route by default so texts reach numbers on Do-Not-Disturb (OTP codes);
 * WhatsApp uses Termii's "whatsapp" channel with the approved sender.
 */
export class TermiiSmsSender implements SmsSender {
  constructor(
    private readonly apiKey: string,
    private readonly senderId: string,
    private readonly baseUrl: string,
    private readonly smsRoute: 'dnd' | 'generic',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send({ to, text, channel = 'sms' }: SmsMessage): Promise<void> {
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.apiKey,
        to: to.replace(/^\+/, ''),
        from: this.senderId,
        sms: text,
        type: 'plain',
        channel: channel === 'whatsapp' ? 'whatsapp' : this.smsRoute,
      }),
    });
    // Throwing lets the queue retry later.
    if (!res.ok) throw new Error(`Termii ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}
