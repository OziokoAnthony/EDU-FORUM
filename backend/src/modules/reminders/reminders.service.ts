import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_NAME, PROFILE_REMINDER, VACANCY_EXPIRY_REMINDER_DAYS } from '@edu-forum/shared';
import { AVAILABLE_USER } from '../../common/available-user';
import { fromDbDate, toDbDate } from '../../common/dates';
import { simpleEmail } from '../../infra/mail/simple-email';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { JOB_QUEUE, type JobQueue } from '../../infra/queue/job-queue';
import { NotificationsService } from '../notifications/notifications.service';
import { CompletenessService } from '../teachers/completeness.service';

const DAY_MS = 86_400_000;
/** Both run daily at 06:00 UTC (7am in Lagos). */
export const REMINDER_JOBS = {
  vacancyExpiry: { name: 'vacancy-expiry-reminders', cron: '0 6 * * *' },
  profileIncomplete: { name: 'profile-incomplete-reminders', cron: '0 6 * * *' },
} as const;

/** "13 Nov 2026" in Lagos. */
const dayLabel = (d: Date) => d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * FR-9 reminders (confirmed 2026-11-01): the poster hears when a live vacancy closes within
 * 3 days (once per deadline); a teacher whose profile was never published hears 3 days after
 * sign-up, then weekly, at most 3 times.
 */
@Injectable()
export class RemindersService implements OnModuleInit {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly completeness: CompletenessService,
    private readonly config: ConfigService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue.register(REMINDER_JOBS.vacancyExpiry.name, () => this.vacancyExpiry().then(() => undefined));
    this.queue.register(REMINDER_JOBS.profileIncomplete.name, () => this.profileIncomplete().then(() => undefined));
    for (const job of Object.values(REMINDER_JOBS)) await this.queue.schedule(job.name, job.cron);
  }

  /** Live vacancies whose deadline is today or within the next 3 days, not yet reminded. */
  async vacancyExpiry(now = new Date()): Promise<number> {
    const today = toDbDate(fromDbDate(now));
    const until = new Date(today.getTime() + VACANCY_EXPIRY_REMINDER_DAYS * DAY_MS);
    const due = await this.prisma.vacancy.findMany({
      where: {
        status: 'published',
        deletedAt: null,
        takedownReason: null,
        expiryReminderSentAt: null,
        deadline: { gte: today, lte: until },
        createdBy: AVAILABLE_USER,
      },
      include: { createdBy: { select: { email: true } } },
    });
    const appUrl = this.config.getOrThrow<string>('APP_URL');
    for (const v of due) {
      const days = Math.round((v.deadline!.getTime() - today.getTime()) / DAY_MS);
      const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
      const title = `“${v.title}” closes ${when}`;
      const body = `It stops taking applications after ${dayLabel(v.deadline!)}. Extend the deadline to keep it open.`;
      const link = `/hiring/vacancies/${v.id}/edit`;
      await this.prisma.vacancy.update({ where: { id: v.id }, data: { expiryReminderSentAt: now } });
      await this.notifications.notify({
        userId: v.createdById,
        type: 'vacancy_expiring',
        title,
        body,
        link,
        email: v.createdBy.email ? simpleEmail(v.createdBy.email, `${title} on ${APP_NAME}`, [body], { url: `${appUrl}${link}`, text: 'Edit the vacancy' }) : undefined,
      });
    }
    if (due.length) this.logger.log(`Sent ${due.length} vacancy expiry reminders`);
    return due.length;
  }

  /** Never-published, verified teachers: 3 days after sign-up, then every 7 days, at most 3 times. */
  async profileIncomplete(now = new Date()): Promise<number> {
    const firstBefore = new Date(now.getTime() - PROFILE_REMINDER.firstAfterDays * DAY_MS);
    const againBefore = new Date(now.getTime() - PROFILE_REMINDER.everyDays * DAY_MS);
    const due = await this.prisma.teacherProfile.findMany({
      where: {
        isPublished: false,
        publishedAt: null,
        moderationNote: null,
        deletedAt: null,
        incompleteRemindersSent: { lt: PROFILE_REMINDER.max },
        user: { ...AVAILABLE_USER, createdAt: { lte: firstBefore }, OR: [{ emailVerifiedAt: { not: null } }, { phoneVerifiedAt: { not: null } }] },
        OR: [{ incompleteRemindedAt: null }, { incompleteRemindedAt: { lte: againBefore } }],
      },
      include: { user: { select: { email: true } } },
    });
    const appUrl = this.config.getOrThrow<string>('APP_URL');
    for (const p of due) {
      const c = await this.completeness.compute(p.id);
      const missing = c.items.filter((i) => i.required && !i.complete).map((i) => i.label.charAt(0).toLowerCase() + i.label.slice(1));
      const [title, body, link] = c.canPublish
        ? ['Your profile is ready to publish', 'Everything required is filled in. Publish it so principals and directors can find you.', '/teacher']
        : [
            `Your profile is ${c.score}% complete`,
            `Add ${missing.join(', ')} to publish it, so principals and directors can find you and you can apply for jobs.`,
            '/teacher/onboarding',
          ];
      await this.prisma.teacherProfile.update({
        where: { id: p.id },
        data: { incompleteRemindersSent: { increment: 1 }, incompleteRemindedAt: now },
      });
      await this.notifications.notify({
        userId: p.userId,
        type: 'profile_incomplete',
        title,
        body,
        link,
        email: p.user.email ? simpleEmail(p.user.email, `${title} on ${APP_NAME}`, [body], { url: `${appUrl}${link}`, text: c.canPublish ? 'Publish my profile' : 'Finish my profile' }) : undefined,
      });
    }
    if (due.length) this.logger.log(`Sent ${due.length} profile reminders`);
    return due.length;
  }
}
