import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAILER, MemoryMailer } from './mail/mailer';
import { SmtpMailer } from './mail/smtp.mailer';
import { ConsoleSmsSender, MemorySmsSender, SMS_SENDER } from './sms/sms-sender';

/** Email + SMS senders, chosen by MAIL_DRIVER / SMS_DRIVER. */
@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('MAIL_DRIVER') === 'memory'
          ? new MemoryMailer()
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
        config.get('SMS_DRIVER') === 'memory' ? new MemorySmsSender() : new ConsoleSmsSender(),
    },
  ],
  exports: [MAILER, SMS_SENDER],
})
export class MessagingModule {}
