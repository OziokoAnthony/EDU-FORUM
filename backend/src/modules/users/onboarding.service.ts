import { Injectable } from '@nestjs/common';
import type { OnboardingResponse, OnboardingStep } from '@edu-forum/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Onboarding progress computed from saved data, so the wizard can resume at any step.
 * "required" = needed to publish a teacher profile (CLAUDE.md publish gate) or to finish
 * school onboarding (FR-3).
 */
@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string): Promise<OnboardingResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const verified = !!(user.emailVerifiedAt || user.phoneVerifiedAt);
    const verifyStep: OnboardingStep = { key: 'verify', label: 'Verify email or phone', required: true, complete: verified };

    let steps: OnboardingStep[];
    if (user.role === 'teacher') steps = [verifyStep, ...(await this.teacherSteps(userId))];
    else if (user.role === 'school_owner') steps = [verifyStep, ...(await this.schoolSteps(userId))];
    else steps = [verifyStep];

    const next = steps.find((s) => s.required && !s.complete);
    return { role: user.role, verified, steps, nextStep: next?.key ?? null, complete: !next };
  }

  private async teacherSteps(userId: string): Promise<OnboardingStep[]> {
    const p = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      include: {
        _count: {
          select: {
            qualifications: { where: { deletedAt: null } },
            certifications: { where: { deletedAt: null } },
            experiences: { where: { deletedAt: null } },
            documents: { where: { deletedAt: null } },
            cvs: { where: { isActive: true, scanStatus: 'clean', deletedAt: null } },
          },
        },
      },
    });
    const visited = new Set(p?.onboardingSteps ?? []);
    const c = p?._count;
    return [
      { key: 'personal', label: 'Personal details', required: true, complete: !!(p?.fullName && p.gender && p.dob) },
      { key: 'location', label: 'Location', required: true, complete: !!(p?.stateId && p.lgaId) },
      { key: 'qualifications', label: 'Qualifications', required: true, complete: (c?.qualifications ?? 0) > 0 },
      // "Required where held": complete once added or explicitly skipped.
      { key: 'certifications', label: 'Teaching certifications', required: false, complete: (c?.certifications ?? 0) > 0 || visited.has('certifications') },
      // A fresh graduate's NYSC / teaching-practice entry counts as an experience row.
      { key: 'experience', label: 'Work experience', required: true, complete: (c?.experiences ?? 0) > 0 },
      { key: 'preferences', label: 'Teaching preferences', required: true, complete: !!(p?.subjects.length && p.levels.length && p.jobTypes.length) },
      { key: 'cv', label: 'CV upload', required: true, complete: (c?.cvs ?? 0) > 0 },
      { key: 'identification', label: 'Identification', required: false, complete: (c?.documents ?? 0) > 0 },
    ];
  }

  private async schoolSteps(userId: string): Promise<OnboardingStep[]> {
    const member = await this.prisma.schoolMember.findFirst({
      where: { userId, status: 'active', deletedAt: null },
      include: { school: { include: { _count: { select: { documents: { where: { deletedAt: null } }, members: true } } } } },
    });
    const s = member?.school;
    const visited = new Set(s?.onboardingSteps ?? []);
    return [
      { key: 'details', label: 'School details', required: true, complete: !!s },
      { key: 'location', label: 'Location', required: true, complete: !!(s?.stateId && s.lgaId && s.addressLine) },
      { key: 'contact', label: 'Contact person', required: true, complete: !!(s?.contactName && s.contactTitle && s.contactPhone && s.contactEmail) },
      // Unverified schools can still post (labelled "unverified"), so this is not blocking.
      { key: 'identification', label: 'Identification', required: false, complete: (s?._count.documents ?? 0) > 0 },
      { key: 'team', label: 'Invite team members', required: false, complete: (s?._count.members ?? 0) > 1 || visited.has('team') },
    ];
  }
}
