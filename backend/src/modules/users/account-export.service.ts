import { Injectable } from '@nestjs/common';
import { APP_NAME } from '@edu-forum/shared';
import { fromDbDate } from '../../common/dates';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const ROLE_NAME: Record<string, string> = { principal: 'Principal', director: 'Director', teacher: 'Teacher' };

/**
 * GET /me/export (NDPA data portability): everything the account holds, as one JSON file.
 * Files are listed with 10-minute download links. Other people appear by role (or a teacher's
 * name for principals/directors, as they see it in the app); anonymous schools stay hidden.
 */
@Injectable()
export class AccountExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  async export(userId: string, now = new Date()): Promise<Record<string, unknown>> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const common = await this.common(userId);
    const role = u.role === 'teacher' ? await this.teacher(userId) : u.role === 'admin' ? {} : await this.leader(userId);
    return {
      exportedAt: now.toISOString(),
      app: APP_NAME,
      note: 'File links expire 10 minutes after this export was made. Download again for fresh links.',
      account: {
        id: u.id,
        email: u.email,
        phone: u.phone,
        role: u.role,
        status: u.status,
        emailVerifiedAt: iso(u.emailVerifiedAt),
        phoneVerifiedAt: iso(u.phoneVerifiedAt),
        consentAcceptedAt: iso(u.consentAcceptedAt),
        consentVersion: u.consentVersion,
        notificationSettings: u.notificationSettings,
        createdAt: iso(u.createdAt),
        lastLoginAt: iso(u.lastLoginAt),
      },
      ...role,
      ...common,
    };
  }

  private link(key: string | null, downloadName?: string) {
    return key ? this.uploads.signedUrl(key, downloadName ? { downloadName } : undefined) : Promise.resolve(null);
  }

  private async common(userId: string) {
    const [conversations, savedItems, savedSearches, notifications] = await Promise.all([
      this.prisma.conversation.findMany({
        where: { deletedAt: null, OR: [{ employerId: userId }, { teacher: { userId } }] },
        include: {
          employer: { select: { role: true } },
          teacher: { select: { fullName: true, userId: true } },
          messages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.savedItem.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.savedSearch.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      conversations: await Promise.all(
        conversations.map(async (c) => ({
          id: c.id,
          with: c.teacher.userId === userId ? (ROLE_NAME[c.employer.role] ?? 'School leader') : (c.teacher.fullName ?? 'Teacher'),
          blocked: !!c.blockedById,
          startedAt: iso(c.createdAt),
          messages: await Promise.all(
            c.messages.map(async (m) => ({
              fromMe: m.senderId === userId,
              body: m.deletedAt ? null : m.body,
              deleted: !!m.deletedAt,
              // Only your own files: the other side's attachments are theirs.
              attachment:
                m.attachmentName && !m.deletedAt
                  ? {
                      name: m.attachmentName,
                      mimeType: m.attachmentMime,
                      sizeBytes: m.attachmentSize,
                      downloadUrl: m.senderId === userId ? await this.link(m.attachmentKey, m.attachmentName) : null,
                    }
                  : null,
              sentAt: iso(m.createdAt),
              readAt: iso(m.readAt),
            })),
          ),
        })),
      ),
      savedItems: savedItems.map((s) => ({ itemType: s.itemType, itemId: s.itemId, savedAt: iso(s.createdAt) })),
      savedSearches: savedSearches.map((s) => ({
        name: s.name,
        scope: s.scope,
        filters: s.filters,
        alertFrequency: s.alertFrequency,
        lastAlertedAt: iso(s.lastAlertedAt),
        createdAt: iso(s.createdAt),
      })),
      notifications: notifications.map((n) => ({ type: n.type, ...(n.payload as Record<string, unknown>), readAt: iso(n.readAt), createdAt: iso(n.createdAt) })),
    };
  }

  private async teacher(userId: string) {
    const p = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      include: {
        state: { select: { name: true } },
        lga: { select: { name: true } },
        qualifications: { where: { deletedAt: null }, include: { type: { select: { name: true } } } },
        certifications: { where: { deletedAt: null }, include: { type: { select: { name: true } } } },
        experiences: { where: { deletedAt: null }, orderBy: { startDate: 'desc' } },
        cvs: { where: { deletedAt: null }, orderBy: { uploadedAt: 'desc' } },
        applications: {
          where: { deletedAt: null },
          include: {
            vacancy: { select: { title: true, state: { select: { name: true } }, lga: { select: { name: true } } } },
            history: { orderBy: { createdAt: 'asc' } },
            interviews: { where: { deletedAt: null }, orderBy: { scheduledAt: 'asc' } },
            cvSnapshot: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        invitations: {
          where: { deletedAt: null },
          include: { vacancy: { select: { title: true } }, invitedBy: { select: { role: true } } },
          orderBy: { createdAt: 'asc' },
        },
        profileViews: { include: { viewer: { select: { role: true } } }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!p) return { teacherProfile: null };
    return {
      teacherProfile: {
        fullName: p.fullName,
        gender: p.gender,
        dateOfBirth: fromDbDate(p.dob),
        bio: p.bio,
        photoUrl: await this.link(p.photoKey),
        location: { country: p.countryCode, state: p.state?.name ?? null, lgaCity: p.lga?.name ?? null, area: p.area, addressLine: p.addressLine, lat: p.lat, lng: p.lng },
        willingToRelocate: p.willingToRelocate,
        preferredStates: p.preferredStates,
        subjects: p.subjects,
        levels: p.levels,
        jobTypes: p.jobTypes,
        expectedSalary: { min: p.expectedSalaryMin, max: p.expectedSalaryMax },
        availableFrom: fromDbDate(p.availableFrom),
        noExperienceYet: p.noExperienceYet,
        isPublished: p.isPublished,
        publishedAt: iso(p.publishedAt),
        completenessScore: p.completenessScore,
        createdAt: iso(p.createdAt),
      },
      qualifications: await Promise.all(
        p.qualifications.map(async (q) => ({ type: q.type.name, course: q.course, institution: q.institution, yearObtained: q.yearObtained, fileUrl: await this.link(q.fileKey) })),
      ),
      certifications: await Promise.all(
        p.certifications.map(async (c) => ({
          type: c.type.name,
          issuer: c.issuer,
          number: c.number,
          issuedAt: fromDbDate(c.issuedAt),
          expiresAt: fromDbDate(c.expiresAt),
          fileUrl: await this.link(c.fileKey),
        })),
      ),
      experiences: p.experiences.map((e) => ({
        kind: e.kind,
        schoolName: e.schoolName,
        role: e.role,
        subjects: e.subjects,
        levels: e.levels,
        startDate: fromDbDate(e.startDate),
        endDate: fromDbDate(e.endDate),
        isCurrent: e.isCurrent,
        description: e.description,
      })),
      cvs: await Promise.all(
        p.cvs.map(async (c) => ({
          fileName: c.fileName,
          mimeType: c.mimeType,
          sizeBytes: c.sizeBytes,
          active: c.isActive,
          uploadedAt: iso(c.uploadedAt),
          replacedAt: iso(c.replacedAt),
          downloadUrl: c.scanStatus === 'clean' ? await this.link(c.objectKey, c.fileName) : null,
        })),
      ),
      applications: await Promise.all(
        p.applications.map(async (a) => ({
          // Anonymous vacancies stay anonymous here too: title and place only.
          vacancy: { title: a.vacancy.title, state: a.vacancy.state.name, lgaCity: a.vacancy.lga.name },
          status: a.status,
          source: a.source,
          coverNote: a.coverNote,
          screeningAnswers: a.screeningAnswers,
          cvSent: { fileName: a.cvSnapshot.fileName, downloadUrl: await this.link(a.cvSnapshot.objectKey, a.cvSnapshot.fileName) },
          appliedAt: iso(a.createdAt),
          history: a.history.map((h) => ({ from: h.fromStatus, to: h.toStatus, message: h.message, at: iso(h.createdAt) })),
          interviews: a.interviews.map((i) => ({ scheduledAt: iso(i.scheduledAt), mode: i.mode, locationOrLink: i.locationOrLink, status: i.status, proposedAt: iso(i.proposedAt), proposalNote: i.proposalNote })),
        })),
      ),
      invitations: p.invitations.map((i) => ({
        vacancy: i.vacancy.title,
        from: ROLE_NAME[i.invitedBy.role] ?? 'School leader',
        message: i.message,
        status: i.status,
        respondedAt: iso(i.respondedAt),
        createdAt: iso(i.createdAt),
      })),
      profileViews: p.profileViews.map((v) => ({ kind: v.kind, viewer: ROLE_NAME[v.viewer.role] ?? 'User', at: iso(v.createdAt) })),
    };
  }

  private async leader(userId: string) {
    const [vacancies, notes, invitations, interviews] = await Promise.all([
      this.prisma.vacancy.findMany({
        where: { createdById: userId, deletedAt: null },
        include: { state: { select: { name: true } }, lga: { select: { name: true } }, _count: { select: { applications: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.applicationNote.findMany({
        where: { authorId: userId, deletedAt: null },
        include: { application: { select: { vacancy: { select: { title: true } }, teacher: { select: { fullName: true } } } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.invitation.findMany({
        where: { invitedById: userId, deletedAt: null },
        include: { vacancy: { select: { title: true } }, teacher: { select: { fullName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.interview.findMany({
        where: { deletedAt: null, application: { vacancy: { createdById: userId } } },
        include: { application: { select: { vacancy: { select: { title: true } }, teacher: { select: { fullName: true } } } } },
        orderBy: { scheduledAt: 'asc' },
      }),
    ]);
    return {
      vacancies: vacancies.map((v) => ({
        title: v.title,
        status: v.status,
        schoolName: v.schoolName,
        schoolType: v.schoolType,
        locationVisibility: v.locationVisibility,
        location: { state: v.state.name, lgaCity: v.lga.name, area: v.area, addressLine: v.addressLine, lat: v.lat, lng: v.lng },
        subjects: v.subjects,
        levels: v.levels,
        jobType: v.jobType,
        salary: { min: v.salaryMin, max: v.salaryMax, currency: v.salaryCurrency, period: v.salaryPeriod },
        description: v.description,
        openings: v.openings,
        benefits: v.benefits,
        screeningQuestions: v.screeningQuestions,
        deadline: fromDbDate(v.deadline),
        startDate: fromDbDate(v.startDate),
        applicants: v._count.applications,
        publishedAt: iso(v.publishedAt),
        closedAt: iso(v.closedAt),
        closeReason: v.closeReason,
        createdAt: iso(v.createdAt),
      })),
      applicantNotes: notes.map((n) => ({ vacancy: n.application.vacancy.title, teacher: n.application.teacher.fullName, note: n.body, createdAt: iso(n.createdAt) })),
      invitationsSent: invitations.map((i) => ({ vacancy: i.vacancy.title, teacher: i.teacher.fullName, message: i.message, status: i.status, createdAt: iso(i.createdAt) })),
      interviews: interviews.map((i) => ({
        vacancy: i.application.vacancy.title,
        teacher: i.application.teacher.fullName,
        scheduledAt: iso(i.scheduledAt),
        mode: i.mode,
        locationOrLink: i.locationOrLink,
        status: i.status,
        notes: i.notes,
      })),
    };
  }
}
