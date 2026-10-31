import { Global, Injectable, Module } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Append-only audit trail of admin actions (CLAUDE.md: log every admin action). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: { actorId: string; action: string; targetType: string; targetId?: string; metadata?: Record<string, unknown> }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
