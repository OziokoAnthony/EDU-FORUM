import { Body, Controller, Module, Post } from '@nestjs/common';
import { reportSchema } from '@edu-forum/shared';
import type { z } from 'zod';
import { CurrentUser, RequireVerified } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ReportsService } from './reports.service';

@Controller('reports')
@RequireVerified()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(reportSchema)) body: z.output<typeof reportSchema>) {
    return this.reports.create(user, body);
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
