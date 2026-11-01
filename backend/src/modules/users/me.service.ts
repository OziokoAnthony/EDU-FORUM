import { HttpStatus, Injectable } from '@nestjs/common';
import type { updateMeSchema, MeResponse } from '@edu-forum/shared';
import type { z } from 'zod';
import { ApiException } from '../../common/filters/api-exception.filter';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { toMeResponse } from './me.mapper';

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async get(userId: string): Promise<MeResponse> {
    return toMeResponse(await this.prisma.user.findUniqueOrThrow({ where: { id: userId } }));
  }

  /** A new email or phone must be verified again, so a verification is sent to it. */
  async update(userId: string, input: z.output<typeof updateMeSchema>): Promise<MeResponse> {
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const data: Record<string, unknown> = {};

    for (const field of ['email', 'phone'] as const) {
      const value = input[field];
      if (value === undefined || value === current[field]) continue;
      const taken = await this.prisma.user.findFirst({ where: { [field]: value, id: { not: userId } } });
      if (taken) {
        throw new ApiException(HttpStatus.CONFLICT, 'CONFLICT', `This ${field === 'email' ? 'email' : 'phone number'} is already in use`);
      }
      data[field] = value;
      data[field === 'email' ? 'emailVerifiedAt' : 'phoneVerifiedAt'] = null;
    }
    if (input.notificationSettings) {
      data.notificationSettings = {
        ...((current.notificationSettings ?? {}) as Record<string, boolean>),
        ...input.notificationSettings,
      };
    }

    const user = await this.prisma.user.update({ where: { id: userId }, data });
    if (data.email || data.phone) await this.auth.sendVerification(user);
    return toMeResponse(user);
  }
}
