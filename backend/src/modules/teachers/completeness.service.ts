import { Injectable } from '@nestjs/common';
import { computeCompleteness, type CompletenessResponse } from '@edu-forum/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Profile completeness (weights in @edu-forum/shared) and the publish gate's "missing" list.
 * The score is stored on the profile so search can rank complete profiles first.
 */
@Injectable()
export class CompletenessService {
  constructor(private readonly prisma: PrismaService) {}

  async compute(teacherId: string): Promise<CompletenessResponse> {
    const p = await this.prisma.teacherProfile.findUniqueOrThrow({
      where: { id: teacherId },
      include: {
        _count: {
          select: {
            qualifications: { where: { deletedAt: null } },
            experiences: { where: { deletedAt: null } },
            cvs: { where: { isActive: true, scanStatus: 'clean', deletedAt: null } },
          },
        },
      },
    });
    return computeCompleteness({
      cv: p._count.cvs > 0,
      qualification: p._count.qualifications > 0,
      experience: p._count.experiences > 0,
      preferences: p.subjects.length > 0 && p.levels.length > 0 && p.jobTypes.length > 0,
      location: !!(p.countryCode && p.stateId && p.lgaId),
      personal: !!(p.fullName && p.gender && p.dob),
      photo: !!p.photoKey,
      bio: !!p.bio,
    });
  }

  /** Recomputes and stores the score; call after every change to the profile. */
  async refresh(teacherId: string): Promise<CompletenessResponse> {
    const result = await this.compute(teacherId);
    await this.prisma.teacherProfile.update({ where: { id: teacherId }, data: { completenessScore: result.score } });
    return result;
  }
}
