import { HttpStatus, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ACCOUNT_DELETION_GRACE_DAYS, ACTIVE_INTERVIEW_STATUSES, APP_NAME, jobPath } from '@edu-forum/shared';
import { ApiException } from '../../common/filters/api-exception.filter';
import { AuditService } from '../../infra/audit/audit.service';
import { EmailQueue } from '../../infra/mail/email-queue';
import { simpleEmail } from '../../infra/mail/simple-email';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { JOB_QUEUE, type JobQueue } from '../../infra/queue/job-queue';
import { RealtimeGateway } from '../../infra/realtime/realtime.gateway';
import { ACCOUNT_RESTORED_JOB } from '../auth/auth.service';
import { SessionService } from '../auth/session.service';
import { SeoNotifier } from '../seo/seo-notifier';
import { UploadsService } from '../uploads/uploads.service';

const DAY_MS = 86_400_000;
export const ACCOUNT_ERASURE_JOB = { name: 'account-erasure', cron: '30 1 * * *' } as const;
/** Shown wherever an erased teacher's name used to be (applications, invitations, chats). */
export const DELETED_TEACHER_NAME = 'Deleted teacher';

const dayLabel = (d: Date) => d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });

/**
 * DELETE /me (confirmed 2026-11-01): the account is hidden at once (search, chats, public job
 * pages, sign-in sessions) and erased 30 days later; signing in before then cancels.
 * Erasure removes personal data and every file. Applications, chats and vacancies stay for
 * the other side, shown as "Deleted teacher" / "Deleted user"; message text is kept, files are not.
 */
@Injectable()
export class AccountDeletionService implements OnModuleInit {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly uploads: UploadsService,
    private readonly seo: SeoNotifier,
    private readonly realtime: RealtimeGateway,
    private readonly emails: EmailQueue,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue.register(ACCOUNT_RESTORED_JOB, (data) => this.announceVacancies(String(data.userId), 'URL_UPDATED'));
    this.queue.register(ACCOUNT_ERASURE_JOB.name, () => this.eraseDue().then(() => undefined));
    await this.queue.schedule(ACCOUNT_ERASURE_JOB.name, ACCOUNT_ERASURE_JOB.cron);
  }

  /** Returns when the data will be erased. Asking twice keeps the first date. */
  async request(userId: string): Promise<Date> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role === 'admin') {
      throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', 'Admin accounts are removed by another admin, not deleted here');
    }
    const requestedAt = user.deletionRequestedAt ?? new Date();
    const erasesOn = new Date(requestedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * DAY_MS);
    if (!user.deletionRequestedAt) {
      await this.prisma.user.update({ where: { id: userId }, data: { deletionRequestedAt: requestedAt } });
      await this.announceVacancies(userId, 'URL_DELETED');
      if (user.email) {
        await this.emails.send(
          simpleEmail(
            user.email,
            `Your ${APP_NAME} account will be deleted`,
            [
              `You asked us to delete your ${APP_NAME} account. It is hidden now, and your data and files will be erased on ${dayLabel(erasesOn)}.`,
              'Changed your mind? Sign in before then and the deletion is cancelled.',
            ],
            { url: `${this.config.getOrThrow<string>('APP_URL')}/login`, text: 'Sign in to keep my account' },
          ),
        );
      }
    }
    await this.sessions.revokeAllForUser(userId);
    this.realtime.disconnectUser(userId);
    return erasesOn;
  }

  /** Daily: erase every account whose 30 days are up. */
  async eraseDue(now = new Date()): Promise<number> {
    const due = await this.prisma.user.findMany({
      where: { deletedAt: null, deletionRequestedAt: { lte: new Date(now.getTime() - ACCOUNT_DELETION_GRACE_DAYS * DAY_MS) } },
      select: { id: true },
    });
    for (const u of due) {
      try {
        await this.erase(u.id, now);
      } catch (err) {
        this.logger.error(`Erasing account ${u.id} failed: ${(err as Error).message}`);
      }
    }
    if (due.length) this.logger.log(`Erased ${due.length} accounts`);
    return due.length;
  }

  async erase(userId: string, now = new Date()): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { teacherProfile: true } });
    if (user.deletedAt) return;
    const p = user.teacherProfile;
    const keys = await this.fileKeys(userId, p?.id ?? null);
    const liveVacancies = await this.prisma.vacancy.findMany({
      where: { createdById: userId, deletedAt: null, status: { in: ['published', 'paused'] } },
      select: { id: true, slug: true, shortId: true, status: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.authToken.deleteMany({ where: { userId } });
      await tx.savedItem.deleteMany({ where: { userId } });
      await tx.savedSearch.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      // Files go from storage below; the rows lose their names and keys here.
      await tx.message.updateMany({
        where: { senderId: userId, attachmentKey: { not: null } },
        data: { attachmentKey: null, attachmentName: null, attachmentMime: null, attachmentSize: null, attachmentUploadId: null },
      });
      await tx.upload.updateMany({ where: { userId, deletedAt: null }, data: { deletedAt: now, fileName: 'deleted' } });
      // Community: the account's own posts and comments go (text erased); likes and blocks too.
      for (const like of await tx.communityLike.findMany({ where: { userId } })) {
        const data = { likesCount: { decrement: 1 } };
        if (like.targetType === 'post') await tx.communityPost.updateMany({ where: { id: like.targetId }, data });
        else await tx.communityComment.updateMany({ where: { id: like.targetId }, data });
      }
      await tx.communityLike.deleteMany({ where: { userId } });
      await tx.communityBlock.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
      await tx.communityPhoto.deleteMany({ where: { post: { authorId: userId } } });
      for (const sh of await tx.communityPost.findMany({ where: { authorId: userId, deletedAt: null, sharedPostId: { not: null } }, select: { sharedPostId: true } })) {
        await tx.communityPost.updateMany({ where: { id: sh.sharedPostId! }, data: { sharesCount: { decrement: 1 } } });
      }
      await tx.communityPost.updateMany({ where: { authorId: userId }, data: { body: '', deletedAt: now } });
      for (const c of await tx.communityComment.findMany({ where: { authorId: userId, deletedAt: null, removedReason: null }, select: { postId: true } })) {
        await tx.communityPost.update({ where: { id: c.postId }, data: { commentsCount: { decrement: 1 } } });
      }
      await tx.communityComment.updateMany({ where: { authorId: userId }, data: { body: '', deletedAt: now } });
      // Blog: the account's posts and comments go (text and cover erased); its likes too.
      for (const like of await tx.blogLike.findMany({ where: { userId } })) {
        const data = { likesCount: { decrement: 1 } };
        if (like.targetType === 'post') await tx.post.updateMany({ where: { id: like.targetId }, data });
        else await tx.blogComment.updateMany({ where: { id: like.targetId }, data });
      }
      await tx.blogLike.deleteMany({ where: { userId } });
      for (const c of await tx.blogComment.findMany({ where: { authorId: userId, deletedAt: null, removedReason: null }, select: { postId: true } })) {
        await tx.post.update({ where: { id: c.postId }, data: { commentsCount: { decrement: 1 } } });
      }
      await tx.blogComment.updateMany({ where: { authorId: userId }, data: { body: '', deletedAt: now } });
      await tx.post.updateMany({ where: { authorId: userId }, data: { body: '', excerpt: null, coverImageKey: null, coverUploadId: null, deletedAt: now } });

      if (p) {
        await tx.qualification.deleteMany({ where: { teacherId: p.id } });
        await tx.certification.deleteMany({ where: { teacherId: p.id } });
        await tx.workExperience.deleteMany({ where: { teacherId: p.id } });
        await tx.profileView.deleteMany({ where: { teacherId: p.id } });
        await tx.cv.deleteMany({ where: { teacherId: p.id } });
        await tx.cvSnapshot.updateMany({
          where: { applications: { some: { teacherId: p.id } } },
          data: { pdfKey: null, fileName: 'deleted', sourceCvId: null },
        });
        await tx.application.updateMany({ where: { teacherId: p.id }, data: { coverNote: null, screeningAnswers: [] } });
        await tx.invitation.updateMany({ where: { teacherId: p.id, status: 'pending' }, data: { status: 'cancelled' } });
        await tx.interview.updateMany({
          where: { application: { teacherId: p.id }, status: { in: ACTIVE_INTERVIEW_STATUSES }, deletedAt: null },
          data: { status: 'cancelled', cancelReason: 'The teacher deleted their account' },
        });
        await tx.teacherProfile.update({
          where: { id: p.id },
          data: {
            fullName: DELETED_TEACHER_NAME,
            gender: null,
            dob: null,
            photoKey: null,
            bio: null,
            stateId: null,
            lgaId: null,
            area: null,
            addressLine: null,
            lat: null,
            lng: null,
            preferredStates: [],
            subjects: [],
            levels: [],
            jobTypes: [],
            expectedSalaryMin: null,
            expectedSalaryMax: null,
            availableFrom: null,
            isPublished: false,
            visibility: 'hidden',
            completenessScore: 0,
            onboardingSteps: [],
            deletedAt: now,
          },
        });
      } else {
        await tx.applicationNote.deleteMany({ where: { authorId: userId } });
        await tx.invitation.updateMany({ where: { invitedById: userId, status: 'pending' }, data: { status: 'cancelled' } });
        await tx.interview.updateMany({
          where: { application: { vacancy: { createdById: userId } }, status: { in: ACTIVE_INTERVIEW_STATUSES }, deletedAt: null },
          data: { status: 'cancelled', cancelReason: 'The principal or director deleted their account' },
        });
        await tx.vacancy.updateMany({
          where: { id: { in: liveVacancies.map((v) => v.id) } },
          data: { status: 'closed', closedAt: now, closeReason: 'cancelled' },
        });
      }

      await tx.user.update({
        where: { id: userId },
        data: { email: null, phone: null, passwordHash: null, googleId: null, notificationSettings: {}, suspendedReason: null, deletedAt: now },
      });
    });

    for (const key of keys) await this.uploads.deleteObject(key).catch(() => undefined);
    for (const v of liveVacancies) await this.seo.notify({ path: jobPath(v), shortId: v.shortId, type: 'URL_DELETED' });
    await this.audit.log({ actorId: userId, action: 'account.erased', targetType: 'user', targetId: userId, metadata: { role: user.role, files: keys.length } });
  }

  /** Every stored object that belongs to this account. */
  private async fileKeys(userId: string, teacherId: string | null): Promise<string[]> {
    const keys = new Set<string>();
    const add = (k: string | null | undefined) => k && keys.add(k);
    for (const u of await this.prisma.upload.findMany({ where: { userId }, select: { objectKey: true } })) add(u.objectKey);
    for (const m of await this.prisma.message.findMany({ where: { senderId: userId, attachmentKey: { not: null } }, select: { attachmentKey: true } })) add(m.attachmentKey);
    if (teacherId) {
      const p = await this.prisma.teacherProfile.findUniqueOrThrow({
        where: { id: teacherId },
        include: { qualifications: true, certifications: true, cvs: true, applications: { include: { cvSnapshot: true } } },
      });
      add(p.photoKey);
      p.qualifications.forEach((q) => add(q.fileKey));
      p.certifications.forEach((c) => add(c.fileKey));
      p.cvs.forEach((c) => (add(c.objectKey), add(c.pdfKey)));
      p.applications.forEach((a) => (add(a.cvSnapshot.objectKey), add(a.cvSnapshot.pdfKey)));
    }
    return [...keys];
  }

  /** Hide (deletion requested) or bring back (cancelled) the poster's live job pages. */
  private async announceVacancies(userId: string, type: 'URL_UPDATED' | 'URL_DELETED'): Promise<void> {
    const live = await this.prisma.vacancy.findMany({
      where: { createdById: userId, status: 'published', deletedAt: null, takedownReason: null },
      select: { slug: true, shortId: true },
    });
    for (const v of live) await this.seo.notify({ path: jobPath(v), shortId: v.shortId, type });
  }
}
