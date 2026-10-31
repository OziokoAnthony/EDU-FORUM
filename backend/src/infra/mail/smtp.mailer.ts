import { createTransport, type Transporter } from 'nodemailer';
import type { Mailer, MailMessage } from './mailer';

export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(
    host: string,
    port: number,
    private readonly from: string,
  ) {
    this.transport = createTransport({ host, port, secure: false });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}
