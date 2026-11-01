import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailQueue } from './mail/email-queue';
import { MAILER, MemoryMailer } from './mail/mailer';
import { ResendMailer } from './mail/resend.mailer';
import { SmtpMailer } from './mail/smtp.mailer';
import { SmsQueue } from './sms/sms-queue';
import { ConsoleSmsSender, MemorySmsSender, SMS_SENDER, TermiiSmsSender } from './sms/sms-sender';

/** Email + SMS senders, chosen by MAIL_DRIVER / SMS_DRIVER, and the queued notification emails. */
@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('MAIL_DRIVER') === 'memory'
          ? new MemoryMailer()
          : config.get('MAIL_DRIVER') === 'resend'
            ? new ResendMailer(config.getOrThrow('RESEND_API_KEY'), config.getOrThrow('MAIL_FROM'))
            : new SmtpMailer(
              config.getOrThrow('SMTP_HOST'),
              config.getOrThrow('SMTP_PORT'),
              config.getOrThrow('MAIL_FROM'),
            ),
    },
    {
      provide: SMS_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('SMS_DRIVER') === 'memory'
          ? new MemorySmsSender()
          : config.get('SMS_DRIVER') === 'termii'
            ? new TermiiSmsSender(config.getOrThrow('TERMII_API_KEY'), config.getOrThrow('TERMII_SENDER_ID'), config.getOrThrow('TERMII_BASE_URL'), config.getOrThrow('TERMII_SMS_ROUTE'))
            : new ConsoleSmsSender(),
    },
    EmailQueue,
    SmsQueue,
  ],
  exports: [MAILER, SMS_SENDER, EmailQueue, SmsQueue],
})
export class MessagingModule {}
