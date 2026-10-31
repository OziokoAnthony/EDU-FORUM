export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Outgoing email. SMTP (Mailpit) locally; a Resend adapter is added for production. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol('MAILER');

/** Keeps messages in memory; used by tests to read verification links. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }

  lastTo(to: string): MailMessage | undefined {
    return [...this.sent].reverse().find((m) => m.to === to);
  }
}
