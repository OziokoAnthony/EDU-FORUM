import { Controller, Get, HttpStatus } from '@nestjs/common';
import { APP_NAME } from '@edu-forum/shared';
import { ApiException } from '../../common/filters/api-exception.filter';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness + readiness: 200 when the API and database respond, 503 otherwise. */
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, 'INTERNAL_ERROR', 'Database unavailable');
    }
    return { status: 'ok', app: APP_NAME, database: 'ok', time: new Date().toISOString() };
  }
}
